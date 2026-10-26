// PyKNW Studio - GitHub Release Auto-Updater
const { app, ipcMain, shell } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const GITHUB_OWNER = 'nawa-dev';
const GITHUB_REPO = 'PyKNW';
const USER_AGENT = 'PyKNW-Studio-Updater';

let activeDownloadReq = null;

/**
 * Compare two semver strings: '1.2.0' vs '1.1.9'
 * returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const clean1 = (v1 || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const clean2 = (v2 || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(clean1.length, clean2.length);

  for (let i = 0; i < len; i++) {
    const a = clean1[i] || 0;
    const b = clean2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Format bytes to readable string (e.g., '52.3 MB')
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Perform HTTPS GET request with automatic redirect following
 */
function fetchWithRedirect(url, options = {}, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('เกิดข้อผิดพลาด: การเปลี่ยนเส้นทาง (Redirect) เกินจำนวนครั้งที่กำหนด'));
    }

    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, options, (res) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          const origin = new URL(url).origin;
          redirectUrl = new URL(redirectUrl, origin).href;
        }
        return resolve(fetchWithRedirect(redirectUrl, options, maxRedirects - 1));
      }

      resolve(res);
    });

    req.on('error', reject);
  });
}

/**
 * Check for updates from GitHub Releases
 */
async function checkForUpdates(mainWindow, isManual = false) {
  const currentVersion = app.getVersion();
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

  try {
    const res = await fetchWithRedirect(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.statusCode === 404) {
      if (isManual && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:not-found', {
          message: 'ยังไม่มีประวัติการปล่อยเวอร์ชัน (Release) บน GitHub'
        });
      }
      return;
    }

    if (res.statusCode !== 200) {
      throw new Error(`GitHub API ตอบกลับสถานะ: ${res.statusCode}`);
    }

    let rawData = '';
    for await (const chunk of res) {
      rawData += chunk;
    }

    const release = JSON.parse(rawData);
    const latestVersion = release.tag_name || release.name;

    if (compareVersions(latestVersion, currentVersion) > 0) {
      // Find .exe installer asset
      let installerAsset = null;
      if (Array.isArray(release.assets)) {
        installerAsset = release.assets.find(a => a.name && a.name.toLowerCase().endsWith('.exe'));
      }

      const updateInfo = {
        hasUpdate: true,
        currentVersion,
        newVersion: latestVersion.replace(/^v/i, ''),
        releaseTitle: release.name || latestVersion,
        releaseNotes: release.body || 'ไม่มีรายละเอียดการเปลี่ยนแปลง',
        publishedAt: release.published_at ? new Date(release.published_at).toLocaleDateString('th-TH') : '',
        htmlUrl: release.html_url,
        downloadUrl: installerAsset ? installerAsset.browser_download_url : release.html_url,
        assetName: installerAsset ? installerAsset.name : null,
        assetSize: installerAsset ? formatBytes(installerAsset.size) : null,
        isDirectInstaller: !!installerAsset
      };

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:available', updateInfo);
      }
    } else {
      if (isManual && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:latest', {
          currentVersion,
          message: 'คุณกำลังใช้งานเวอร์ชันล่าสุดแล้ว'
        });
      }
    }
  } catch (err) {
    if (isManual && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:error', {
        message: `ไม่สามารถตรวจสอบการอัปเดตได้: ${err.message}`
      });
    }
  }
}

/**
 * Download installer file and run it
 */
async function downloadAndInstall(mainWindow, updateInfo) {
  if (!updateInfo || !updateInfo.downloadUrl) {
    throw new Error('ไม่พบลิงก์สำหรับดาวน์โหลดไฟล์');
  }

  // If there's no direct .exe asset, open the release page in default browser
  if (!updateInfo.isDirectInstaller) {
    shell.openExternal(updateInfo.htmlUrl || updateInfo.downloadUrl);
    return;
  }

  const tempDir = path.join(app.getPath('temp'), 'PyKNW-Update');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = updateInfo.assetName || `PyKNW-Setup-${updateInfo.newVersion}.exe`;
  const filePath = path.join(tempDir, fileName);

  const res = await fetchWithRedirect(updateInfo.downloadUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (res.statusCode !== 200) {
    throw new Error(`ดาวน์โหลดล้มเหลว (HTTP ${res.statusCode})`);
  }

  const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
  let downloadedBytes = 0;
  let lastProgressUpdate = 0;

  const fileStream = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      fileStream.write(chunk);

      const now = Date.now();
      // Throttle IPC events to every 100ms
      if (now - lastProgressUpdate > 100 || downloadedBytes === totalBytes) {
        lastProgressUpdate = now;
        const percent = totalBytes > 0 ? Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100)) : 0;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:download-progress', {
            percent,
            downloaded: formatBytes(downloadedBytes),
            total: formatBytes(totalBytes)
          });
        }
      }
    });

    res.on('end', () => {
      fileStream.end(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:download-complete');
        }

        // Wait a short delay for user feedback, then launch installer and exit app
        setTimeout(() => {
          try {
            const installerProcess = spawn(filePath, [], {
              detached: true,
              stdio: 'ignore'
            });
            installerProcess.unref();
            app.quit();
          } catch (launchErr) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update:error', {
                message: `ไม่สามารถเริ่มไฟล์ติดตั้งได้: ${launchErr.message}`
              });
            }
          }
        }, 1200);

        resolve(true);
      });
    });

    res.on('error', (err) => {
      fileStream.close();
      try { fs.unlinkSync(filePath); } catch (e) {}
      reject(err);
    });
  });
}

/**
 * Setup IPC Listeners for Auto-Update
 */
function setupAutoUpdater(mainWindow) {
  // Check for updates manually
  ipcMain.handle('updater:check', async () => {
    await checkForUpdates(mainWindow, true);
    return true;
  });

  // Start download & install
  ipcMain.handle('updater:download', async (event, updateInfo) => {
    try {
      if (updateInfo && updateInfo.isMock) {
        // จำลองการดาวน์โหลดเสมือนจริง (Progress 0% -> 100%) สำหรับการทดสอบ
        let percent = 0;
        const totalMB = 84.5;
        const interval = setInterval(() => {
          percent += 15;
          if (percent >= 100) {
            percent = 100;
            clearInterval(interval);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update:download-progress', {
                percent: 100,
                downloaded: '84.5 MB',
                total: '84.5 MB'
              });
              mainWindow.webContents.send('update:download-complete');
            }
          } else {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update:download-progress', {
                percent,
                downloaded: `${((totalMB * percent) / 100).toFixed(1)} MB`,
                total: `${totalMB} MB`
              });
            }
          }
        }, 250);
        return { success: true };
      }

      await downloadAndInstall(mainWindow, updateInfo);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Open release page in browser
  ipcMain.handle('updater:open-url', async (event, url) => {
    if (url) shell.openExternal(url);
  });

  // Test / Simulation Mode for easy verification
  ipcMain.handle('updater:simulate-mock', async () => {
    const currentVersion = app.getVersion();
    const mockInfo = {
      hasUpdate: true,
      currentVersion,
      newVersion: '1.1.0',
      releaseTitle: 'PyKNW Studio v1.1.0 (อัปเดตใหม่)',
      releaseNotes: `### ✨ มีอะไรใหม่ใน v1.1.0\n- เพิ่มระบบรองรับฟังก์ชัน \`input()\` แบบ Interactive ในหน้าต่าง Console\n- เพิ่มปุ่มบันทึกเป็น (Save As) และระบบบันทึกอัตโนมัติก่อนรันโค้ด\n- ปรับปรุงการแปลข้อผิดพลาดภาษาไทยให้เข้าใจง่ายยิ่งขึ้น\n- เพิ่มระบบตรวจจับและอัปเดตเวอร์ชันใหม่อัตโนมัติจาก GitHub Releases`,
      publishedAt: new Date().toLocaleDateString('th-TH'),
      htmlUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      downloadUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v1.1.0/PyKNW-Setup-1.1.0.exe`,
      assetName: 'PyKNW-Setup-1.1.0.exe',
      assetSize: '84.5 MB',
      isDirectInstaller: true, // แสดงปุ่ม "อัปเดตทันที" พร้อมแถบโหลดอัตโนมัติ
      isMock: true
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', mockInfo);
    }
    return mockInfo;
  });

  // Check automatically on app launch after 3 seconds
  setTimeout(() => {
    checkForUpdates(mainWindow, false);
  }, 3000);
}

module.exports = {
  setupAutoUpdater,
  checkForUpdates
};
