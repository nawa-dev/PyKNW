const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pyknwAPI', {
  // Window Controls (Custom VS Code titlebar)
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  setUnsavedStatus: (dirtyList) => ipcRenderer.send('app:set-unsaved-status', dirtyList),
  onMaximizeChange: (callback) => {
    const handler = (event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximize-change', handler);
    return () => ipcRenderer.removeListener('window:maximize-change', handler);
  },

  // File operations
  openFile: () => ipcRenderer.invoke('dialog:open-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('fs:save-file', { filePath, content }),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:save-file', defaultName),
  onFileOpenedByOS: (callback) => {
    ipcRenderer.on('app:open-file', (event, data) => callback(data));
  },

  // Python Execution
  runCode: (code, filePath, stepDelay = 0.3) => ipcRenderer.invoke('python:run', { code, filePath, stepDelay }),
  stopCode: () => ipcRenderer.invoke('python:stop'),
  sendStdin: (text) => ipcRenderer.invoke('python:stdin', text),
  onStep: (callback) => {
    const handler = (event, line) => callback(line);
    ipcRenderer.on('python:step', handler);
    return () => ipcRenderer.removeListener('python:step', handler);
  },
  onStdout: (callback) => {
    const handler = (event, text) => callback(text);
    ipcRenderer.on('python:stdout', handler);
    return () => ipcRenderer.removeListener('python:stdout', handler);
  },
  onStderr: (callback) => {
    const handler = (event, text) => callback(text);
    ipcRenderer.on('python:stderr', handler);
    return () => ipcRenderer.removeListener('python:stderr', handler);
  },
  onExit: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('python:exit', handler);
    return () => ipcRenderer.removeListener('python:exit', handler);
  },

  // App details
  getAppName: () => ipcRenderer.invoke('app:get-product-name'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getPythonInfo: () => ipcRenderer.invoke('python:get-info'),

  // Native Clipboard operations
  readClipboard: () => ipcRenderer.invoke('clipboard:read-text'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write-text', text),

  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  startUpdateDownload: (updateInfo) => ipcRenderer.invoke('updater:download', updateInfo),
  openUpdateUrl: (url) => ipcRenderer.invoke('updater:open-url', url),
  simulateMockUpdate: () => ipcRenderer.invoke('updater:simulate-mock'),
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateNotAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update:latest', handler);
    return () => ipcRenderer.removeListener('update:latest', handler);
  },
  onUpdateDownloadProgress: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('update:download-progress', handler);
    return () => ipcRenderer.removeListener('update:download-progress', handler);
  },
  onUpdateDownloadComplete: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update:download-complete', handler);
    return () => ipcRenderer.removeListener('update:download-complete', handler);
  },
  onUpdateError: (callback) => {
    const handler = (event, err) => callback(err);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.removeListener('update:error', handler);
  }
});
