const { app, BrowserWindow, ipcMain, dialog, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const { setupAutoUpdater } = require('./updater');
const { packContainer, unpackContainer } = require('./security');
const pkg = require('../../package.json');
const APP_PRODUCT_NAME = pkg.productName || (pkg.build && pkg.build.productName) || pkg.name || 'KNW-Py';

let mainWindow = null;
let currentChildProcess = null;
let fileToOpenOnStartup = null;
let unsavedFiles = [];
let isForceQuit = false;

// Determine path to bundled Python embeddable executable
function getBundledPythonPath() {
  const possiblePaths = [
    // Development mode
    path.join(__dirname, '../../resources/python/python.exe'),
    // Packaged mode (electron-builder extraResources)
    path.join(process.resourcesPath, 'resources/python/python.exe'),
    path.join(process.resourcesPath, 'python/python.exe'),
    path.join(app.getAppPath(), '../resources/python/python.exe')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Determine path to helper runner script for line highlight tracing
function getRunnerScriptPath() {
  const possiblePaths = [
    path.join(__dirname, '../../resources/runner.py'),
    path.join(process.resourcesPath, 'resources/runner.py'),
    path.join(process.resourcesPath, 'runner.py'),
    path.join(app.getAppPath(), '../resources/runner.py')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function createWindow() {
  const iconPath = path.join(__dirname, '../image/PyKNW.ico');

  mainWindow = new BrowserWindow({
    title: APP_PRODUCT_NAME,
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#18181b',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    frame: false, // Remove default OS white titlebar (Frameless window like VS Code)
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximize-change', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximize-change', false);
    }
  });

  mainWindow.on('close', (e) => {
    if (isForceQuit) return;

    if (unsavedFiles.length > 0) {
      e.preventDefault();
      const fileNames = unsavedFiles.join(', ');
      const detailMsg = unsavedFiles.length === 1
        ? `ไฟล์ "${fileNames}" มีการแก้ไขที่ยังไม่ได้บันทึก\nหากปิดโปรแกรม ข้อมูลที่แก้ไขล่าสุดจะสูญหาย`
        : `มีไฟล์ที่ยังไม่ได้บันทึกจำนวน ${unsavedFiles.length} ไฟล์ (${fileNames})\nหากปิดโปรแกรม ข้อมูลที่แก้ไขล่าสุดจะสูญหาย`;

      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['ปิดโปรแกรม (ไม่บันทึก)', 'ยกเลิก'],
        defaultId: 1,
        cancelId: 1,
        title: `${APP_PRODUCT_NAME} - ยืนยันการปิดโปรแกรม`,
        message: 'มีไฟล์ที่ยังไม่ได้บันทึก ต้องการปิดโปรแกรมหรือไม่?',
        detail: detailMsg
      });

      if (choice === 0) {
        isForceQuit = true;
        mainWindow.close();
      }
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (fileToOpenOnStartup && fs.existsSync(fileToOpenOnStartup)) {
      try {
        const rawContent = fs.readFileSync(fileToOpenOnStartup, 'utf-8');
        const parsed = unpackContainer(rawContent, fileToOpenOnStartup);
        mainWindow.webContents.send('app:open-file', {
          filePath: fileToOpenOnStartup,
          content: parsed.code,
          isTampered: parsed.isTampered,
          tamperedReason: parsed.reason || null
        });
        fileToOpenOnStartup = null;
      } catch (err) {
        console.error('Error opening startup file:', err);
      }
    }
  });

  // Setup GitHub Release Auto-Updater
  setupAutoUpdater(mainWindow);

  mainWindow.on('closed', () => {
    if (currentChildProcess) {
      try {
        currentChildProcess.kill();
      } catch (e) {}
    }
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check for file in args
      const filePath = commandLine.find(arg => arg.endsWith('.pyknw') || arg.endsWith('.py'));
      if (filePath && fs.existsSync(filePath)) {
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = unpackContainer(rawContent, filePath);
        mainWindow.webContents.send('app:open-file', {
          filePath,
          content: parsed.code,
          isTampered: parsed.isTampered,
          tamperedReason: parsed.reason || null
        });
      }
    }
  });

  app.whenReady().then(() => {
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
          return callback(true);
        }
        callback(false);
      });
    }

    // Check initial command line argument for opened file
    const targetArg = process.argv.slice(app.isPackaged ? 1 : 2).find(arg => arg.endsWith('.pyknw') || arg.endsWith('.py'));
    if (targetArg && fs.existsSync(targetArg)) {
      fileToOpenOnStartup = targetArg;
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  isForceQuit = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Synchronize Unsaved Files Status
ipcMain.on('app:set-unsaved-status', (event, dirtyList) => {
  unsavedFiles = Array.isArray(dirtyList) ? dirtyList : [];
});

// IPC Handler: Window Controls
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    } else {
      mainWindow.maximize();
      return true;
    }
  }
  return false;
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// IPC Handler: App Name & Info
ipcMain.handle('app:get-name', () => {
  return APP_PRODUCT_NAME;
});

ipcMain.handle('app:get-info', () => {
  return {
    name: APP_PRODUCT_NAME,
    version: app.getVersion()
  };
});

// IPC Handler: App Version
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// IPC Handler: Native Clipboard Access
ipcMain.handle('clipboard:read-text', () => {
  try {
    return clipboard.readText();
  } catch (err) {
    console.error('Failed to read native clipboard:', err);
    return '';
  }
});

ipcMain.handle('clipboard:write-text', (event, text) => {
  try {
    clipboard.writeText(typeof text === 'string' ? text : '');
    return true;
  } catch (err) {
    console.error('Failed to write native clipboard:', err);
    return false;
  }
});

// IPC Handler: Python Info
ipcMain.handle('python:get-info', async () => {
  const pyPath = getBundledPythonPath();
  return {
    bundled: !!pyPath,
    path: pyPath || 'Not found'
  };
});

// IPC Handler: Run Code
ipcMain.handle('python:run', async (event, { code, filePath, stepDelay = 0.3 }) => {
  const pyPath = getBundledPythonPath();
  if (!pyPath) {
    throw new Error('ไม่พบตัวรัน Python ในโปรแกรม (Bundled Python Not Found)');
  }

  const runnerScript = getRunnerScriptPath();

  // Terminate any previous execution
  if (currentChildProcess) {
    try {
      currentChildProcess.kill();
    } catch (e) {}
  }

  // Always write pure Python code to a temporary execution script
  const tempDir = path.join(os.tmpdir(), 'pyknw_runner');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const scriptPath = path.join(tempDir, `exec_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, code, 'utf-8');
  const isTemp = true;

  const scriptDir = (filePath && fs.existsSync(filePath)) ? path.dirname(filePath) : tempDir;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let hasSentExit = false;
    let stdoutBuffer = '';

    const spawnArgs = runnerScript
      ? ['-u', runnerScript, scriptPath]
      : ['-u', scriptPath];

    // Configure embedded Tcl/Tk environment for GUI (tkinter)
    const pythonDir = path.dirname(pyPath);
    const tclLib = path.join(pythonDir, 'tcl', 'tcl8.6');
    const tkLib = path.join(pythonDir, 'tcl', 'tk8.6');

    const envVars = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYKNW_STEP_DELAY: String(stepDelay)
    };

    if (fs.existsSync(tclLib)) {
      envVars.TCL_LIBRARY = tclLib;
    }
    if (fs.existsSync(tkLib)) {
      envVars.TK_LIBRARY = tkLib;
    }

    currentChildProcess = spawn(pyPath, spawnArgs, {
      cwd: scriptDir,
      env: envVars
    });

    currentChildProcess.stdout.on('data', (data) => {
      stdoutBuffer += data.toString('utf-8');

      while (true) {
        const lineIdx = stdoutBuffer.indexOf('__PYKNW_LINE__:');
        if (lineIdx === -1) {
          // Check if buffer ends with a partial '__PYKNW_LINE__:' marker
          const marker = '__PYKNW_LINE__:';
          let safeSendIdx = stdoutBuffer.length;
          for (let i = 1; i < marker.length; i++) {
            if (stdoutBuffer.endsWith(marker.slice(0, i))) {
              safeSendIdx = stdoutBuffer.length - i;
              break;
            }
          }

          const textToSend = stdoutBuffer.slice(0, safeSendIdx);
          if (textToSend.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python:stdout', textToSend);
          }
          stdoutBuffer = stdoutBuffer.slice(safeSendIdx);
          break;
        }

        // If there is text before __PYKNW_LINE__, send that out first
        if (lineIdx > 0) {
          const prefix = stdoutBuffer.slice(0, lineIdx);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python:stdout', prefix);
          }
          stdoutBuffer = stdoutBuffer.slice(lineIdx);
        }

        // stdoutBuffer starts with '__PYKNW_LINE__:'
        const newlineIdx = stdoutBuffer.indexOf('\n');
        if (newlineIdx === -1) {
          // Still waiting for rest of the __PYKNW_LINE__ line
          break;
        }

        const fullLine = stdoutBuffer.slice(0, newlineIdx).replace('\r', '');
        const lineNum = parseInt(fullLine.replace('__PYKNW_LINE__:', ''), 10);
        if (!isNaN(lineNum) && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('python:step', lineNum);
        }

        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
      }
    });

    currentChildProcess.stderr.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:stderr', data.toString('utf-8'));
      }
    });

    const finish = (code, signal) => {
      if (hasSentExit) return;
      hasSentExit = true;
      currentChildProcess = null;

      // Flush remaining stdout buffer
      if (stdoutBuffer) {
        const clean = stdoutBuffer.replace('\r', '');
        if (clean.startsWith('__PYKNW_LINE__:')) {
          const lineNum = parseInt(clean.replace('__PYKNW_LINE__:', ''), 10);
          if (!isNaN(lineNum) && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python:step', lineNum);
          }
        } else {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python:stdout', stdoutBuffer);
          }
        }
        stdoutBuffer = '';
      }

      if (isTemp && fs.existsSync(scriptPath)) {
        try { fs.unlinkSync(scriptPath); } catch (e) {}
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:exit', { code, signal, elapsed });
      }
      resolve({ success: true, elapsed });
    };

    currentChildProcess.on('close', (code, signal) => finish(code, signal));
    currentChildProcess.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:stderr', `ข้อผิดพลาดของกระบวนการ: ${err.message}\n`);
      }
      finish(-1, null);
    });
  });
});

// IPC Handler: Stop Code
ipcMain.handle('python:stop', async () => {
  if (currentChildProcess) {
    try {
      currentChildProcess.kill('SIGKILL');
      currentChildProcess = null;
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
});

// IPC Handler: Send Interactive Stdin
ipcMain.handle('python:stdin', async (event, text) => {
  if (currentChildProcess && currentChildProcess.stdin && !currentChildProcess.stdin.destroyed) {
    try {
      currentChildProcess.stdin.write(text + '\n', 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'ไม่มีโปรแกรมที่กำลังทำงานอยู่' };
});

// IPC Handler: File Dialogs
ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'เปิดไฟล์โค้ด',
    filters: [
      { name: 'ไฟล์ PyKNW (*.pyknw)', extensions: ['pyknw'] },
      { name: 'ไฟล์ Python (*.py)', extensions: ['py'] },
      { name: 'ไฟล์ทั้งหมด (*.*)', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths.map(filePath => {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = unpackContainer(rawContent, filePath);
    return {
      filePath,
      content: parsed.code,
      isTampered: parsed.isTampered,
      tamperedReason: parsed.reason || null
    };
  });
});

ipcMain.handle('dialog:save-file', async (event, defaultName = 'main.pyknw') => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'บันทึกไฟล์เป็น',
    defaultPath: defaultName,
    filters: [
      { name: 'ไฟล์ PyKNW (*.pyknw)', extensions: ['pyknw'] },
      { name: 'ไฟล์ Python (*.py)', extensions: ['py'] },
      { name: 'ไฟล์ทั้งหมด (*.*)', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
});

ipcMain.handle('fs:save-file', async (event, { filePath, content }) => {
  try {
    if (filePath && filePath.toLowerCase().endsWith('.pyknw')) {
      const container = packContainer(content);
      fs.writeFileSync(filePath, JSON.stringify(container, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
