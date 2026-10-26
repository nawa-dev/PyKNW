const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const { setupAutoUpdater } = require('./updater');

let mainWindow = null;
let currentChildProcess = null;
let fileToOpenOnStartup = null;

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

  mainWindow.webContents.once('did-finish-load', () => {
    if (fileToOpenOnStartup && fs.existsSync(fileToOpenOnStartup)) {
      try {
        const content = fs.readFileSync(fileToOpenOnStartup, 'utf-8');
        mainWindow.webContents.send('app:open-file', {
          filePath: fileToOpenOnStartup,
          content
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
        const content = fs.readFileSync(filePath, 'utf-8');
        mainWindow.webContents.send('app:open-file', { filePath, content });
      }
    }
  });

  app.whenReady().then(() => {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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

// IPC Handler: App Version
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
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

  // Create temporary file or use existing file
  let scriptPath = filePath;
  let isTemp = false;

  if (!scriptPath) {
    const tempDir = path.join(os.tmpdir(), 'pyknw_runner');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    scriptPath = path.join(tempDir, `script_${Date.now()}.pyknw`);
    fs.writeFileSync(scriptPath, code, 'utf-8');
    isTemp = true;
  } else {
    // Save current code to the file before running
    fs.writeFileSync(scriptPath, code, 'utf-8');
  }

  const scriptDir = path.dirname(scriptPath);

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

  return result.filePaths.map(filePath => ({
    filePath,
    content: fs.readFileSync(filePath, 'utf-8')
  }));
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
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});
