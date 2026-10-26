// KNW-Py / PyKNW Studio - GitHub Pages Controller
const REPO_OWNER = 'nawa-dev';
const REPO_NAME = 'PyKNW';
const FALLBACK_VERSION = 'v1.2.0';
const DEFAULT_PRODUCT_NAME = 'KNW-Py';

let directDownloadUrl = null;
let currentFileName = `${DEFAULT_PRODUCT_NAME}-Setup.exe`;
let currentProductName = DEFAULT_PRODUCT_NAME;
let toastTimeout = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  syncProductNameFromRepo();
  fetchLatestReleaseInfo();
  setupDownloadButton();
});

// Sync productName dynamically from package.json in the repository
async function syncProductNameFromRepo() {
  try {
    const response = await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/package.json`);
    if (response.ok) {
      const pkg = await response.json();
      const productName = pkg.productName || (pkg.build && pkg.build.productName);
      if (productName && productName !== currentProductName) {
        currentProductName = productName;
        applyProductName(productName);
      }
    }
  } catch (err) {
    console.warn('Could not sync productName from package.json, using default:', err);
  }
}

// Apply updated product name across all elements in the landing page
function applyProductName(name) {
  // Update title
  document.title = `${name} - โปรแกรมเขียนโค้ดภาษา Python สำหรับการเรียนรู้`;

  // Update elements with class 'app-name'
  document.querySelectorAll('.app-name').forEach(el => {
    el.textContent = name;
  });

  // Update Download button title
  const btnTitle = document.getElementById('btnDownloadTitle');
  if (btnTitle) {
    btnTitle.textContent = `ดาวน์โหลด ${name} สำหรับ Windows`;
  }
}

// Fetch latest release asset (.exe) from GitHub Releases API
async function fetchLatestReleaseInfo() {
  const metaEl = document.getElementById('downloadMeta');
  const badgeEl = document.getElementById('versionBadge');
  const btn = document.getElementById('btnDirectDownload');

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const release = await response.json();
    const assets = release.assets || [];

    // Find Windows Installer asset (.exe)
    const exeAsset = assets.find(asset => asset.name.toLowerCase().endsWith('.exe'));

    if (exeAsset) {
      directDownloadUrl = exeAsset.browser_download_url;
      currentFileName = exeAsset.name;

      const sizeMB = (exeAsset.size / (1024 * 1024)).toFixed(1);
      const tagName = release.tag_name || FALLBACK_VERSION;

      if (badgeEl) badgeEl.textContent = tagName;
      if (metaEl) {
        metaEl.textContent = `${tagName} (.exe) • ${sizeMB} MB • สำหรับ Windows 10/11`;
      }
      if (btn) {
        btn.href = directDownloadUrl;
        btn.setAttribute('download', currentFileName);
      }
      return;
    }
  } catch (err) {
    console.warn('Could not retrieve release asset via GitHub API, using fallback:', err);
  }

  // Fallback direct URL pattern:
  directDownloadUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  if (badgeEl) badgeEl.textContent = FALLBACK_VERSION;
  if (metaEl) {
    metaEl.textContent = `${FALLBACK_VERSION} (.exe) • สำหรับ Windows 10/11`;
  }
  if (btn) {
    btn.href = directDownloadUrl;
  }
}

// Setup download button click handler
function setupDownloadButton() {
  const btn = document.getElementById('btnDirectDownload');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    // If we have a direct binary URL ending with .exe, trigger download directly in-page!
    if (directDownloadUrl && directDownloadUrl.endsWith('.exe')) {
      e.preventDefault(); // Stop standard navigation / jumping
      triggerInPageDownload(directDownloadUrl, currentFileName);
    } else {
      // If direct binary not known yet, try to trigger download link directly
      showDownloadToast('กำลังเชื่อมต่อการดาวน์โหลด...');
    }
  });
}

// Trigger browser download without navigating away from the page
function triggerInPageDownload(url, filename) {
  // Method: Temporary anchor with download attribute
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Show user notification toast
  showDownloadToast(`เริ่มดาวน์โหลด ${filename} แล้ว กรุณาตรวจสอบที่แถบดาวน์โหลดของเบราว์เซอร์`);
}

// Show floating toast notification on the page
function showDownloadToast(message) {
  const toast = document.getElementById('downloadToast');
  const toastDesc = document.getElementById('toastDesc');
  if (!toast) return;

  if (toastDesc && message) {
    toastDesc.textContent = message;
  }

  toast.classList.add('show');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}
