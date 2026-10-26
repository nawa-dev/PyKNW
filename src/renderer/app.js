// PyKNW Studio - Application Controller
let editor = null;
let tabs = [];
let activeTabId = null;
let tabCounter = 1;
let isRunning = false;
let isDockRight = false;

// Zoom configuration
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_CONSOLE_FONT_SIZE = 12.5;
let currentFontSize = DEFAULT_FONT_SIZE;
let currentConsoleFontSize = DEFAULT_CONSOLE_FONT_SIZE;

// Security: In-Memory Internal Clipboard State
let internalClipboard = null;

// UI Elements
const workspaceContainer = document.getElementById('workspaceContainer');
const tabsContainer = document.getElementById('tabsContainer');
const btnNewTab = document.getElementById('btnNewTab');
const btnNew = document.getElementById('btnNew');
const btnOpen = document.getElementById('btnOpen');
const btnSave = document.getElementById('btnSave');
const btnSaveAs = document.getElementById('btnSaveAs');
const btnRunStop = document.getElementById('btnRunStop');
const runStopIcon = document.getElementById('runStopIcon');
const runStopText = document.getElementById('runStopText');
const btnTraceSpeed = document.getElementById('btnTraceSpeed');
const traceSpeedLabel = document.getElementById('traceSpeedLabel');
const btnClear = document.getElementById('btnClear');
const btnConsoleZoomIn = document.getElementById('btnConsoleZoomIn');
const btnConsoleZoomOut = document.getElementById('btnConsoleZoomOut');
const btnToggleLayout = document.getElementById('btnToggleLayout');
const dockIcon = document.getElementById('dockIcon');
const dockText = document.getElementById('dockText');
const outputSection = document.getElementById('outputSection');
const outputBody = document.getElementById('outputBody');
const consoleInputForm = document.getElementById('consoleInputForm');
const consoleInput = document.getElementById('consoleInput');
const btnSendInput = document.getElementById('btnSendInput');
const editorCursorEl = document.getElementById('editorCursor');
const editorZoomEl = document.getElementById('editorZoom');
const tabCountStatusEl = document.getElementById('tabCountStatus');
const appVersionStatus = document.getElementById('appVersionStatus');
const tamperBanner = document.getElementById('tamperBanner');
const tamperReasonText = document.getElementById('tamperReasonText');
const panelResizer = document.getElementById('panelResizer');

// Window Control Elements
const winMinBtn = document.getElementById('winMinBtn');
const winMaxBtn = document.getElementById('winMaxBtn');
const winMaxIcon = document.getElementById('winMaxIcon');
const winCloseBtn = document.getElementById('winCloseBtn');

// ==========================================
// Initialize Monaco Editor & Application
// ==========================================
require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });

require(['vs/editor/editor.main'], function () {
  // 1. Register .pyknw with Python Language Server
  monaco.languages.register({ id: 'python', extensions: ['.py', '.pyknw'], aliases: ['PyKNW', 'pyknw'] });

  // 2. Create Monaco Editor instance
  editor = monaco.editor.create(document.getElementById('editorContainer'), {
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: currentFontSize,
    fontFamily: 'Consolas, "Courier New", monospace',
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    tabSize: 4,
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    mouseWheelZoom: false // Handled directly by our unified zoom controller
  });

  // Track cursor position
  editor.onDidChangeCursorPosition((e) => {
    editorCursorEl.textContent = `บรรทัด ${e.position.lineNumber}, คอลัมน์ ${e.position.column}`;
  });

  // Setup Anti-External Paste Security
  setupClipboardShield();

  // Setup Keyboard Shortcuts (Hotkeys)
  setupShortcuts();

  // Setup Window Controls (Frameless Titlebar)
  setupWindowControls();

  // Create initial demo tab
  const sampleCode = `# PyKNW Studio - โปรแกรมเขียนโค้ดภาษา Python (.pyknw)
# ทำงานได้ทันทีโดยไม่ต้องติดตั้ง Python ลงในเครื่อง
# ----------------------------------------------------

def main():
    print("ยินดีต้อนรับสู่ PyKNW Studio")
    for i in range(1, 4):
        print(f"ขั้นตอนที่ {i}: สำเร็จ")

if __name__ == "__main__":
    main()
`;
  createTab('main.pyknw', sampleCode, null);
});

// ==========================================
// Multi-Tab Management
// ==========================================
function createTab(title, content = '', filePath = null, isTampered = false, tamperedReason = null) {
  const tabId = `tab_${Date.now()}_${tabCounter++}`;
  const uri = monaco.Uri.parse(`inmemory://pyknw/${tabId}/${title}`);
  const model = monaco.editor.createModel(content, 'python', uri);

  const tab = {
    id: tabId,
    title: title,
    filePath: filePath,
    model: model,
    viewState: null,
    isDirty: false,
    isTampered: !!isTampered,
    tamperedReason: tamperedReason || null
  };

  model.onDidChangeContent(() => {
    clearHighlightLine();
    if (!tab.isDirty) {
      tab.isDirty = true;
      renderTabs();
    }
  });

  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function switchTab(tabId) {
  const currentTab = getCurrentTab();
  if (currentTab && editor) {
    currentTab.viewState = editor.saveViewState();
  }

  activeTabId = tabId;
  const targetTab = getCurrentTab();
  if (!targetTab) return;

  clearHighlightLine();
  editor.setModel(targetTab.model);
  if (targetTab.viewState) {
    editor.restoreViewState(targetTab.viewState);
  }
  editor.focus();

  renderTabs();
  updateTitleBar();
  updateTamperStatus();
}

function updateTamperStatus() {
  const currentTab = getCurrentTab();
  if (!tamperBanner) return;

  if (currentTab && currentTab.isTampered) {
    tamperBanner.style.display = 'flex';
    if (tamperReasonText) {
      const teacherNote = isTeacherMode ? '[โหมดครูผู้สอน: ปลดล็อกการรันและบันทึก] ' : '';
      tamperReasonText.textContent = teacherNote + (currentTab.tamperedReason || 'ไฟล์นี้ไม่ผ่านการตรวจสอบลายเซ็นความปลอดภัย ปุ่ม [ รัน ] ถูกระงับการใช้งาน');
    }
    if (btnRunStop) {
      if (isTeacherMode) {
        btnRunStop.classList.remove('blocked');
        btnRunStop.title = 'รันไฟล์ปัจจุบัน (โหมดครูผู้สอนอนุญาต)';
      } else {
        btnRunStop.classList.add('blocked');
        btnRunStop.title = 'ปุ่มรันถูกระงับ: ตรวจพบการแก้ไขหรือวางโค้ดจาก Notepad';
      }
    }
  } else {
    tamperBanner.style.display = 'none';
    if (btnRunStop && !isRunning) {
      btnRunStop.classList.remove('blocked');
      btnRunStop.title = 'รันไฟล์ปัจจุบัน (F5 หรือ Ctrl+Enter)';
    }
  }

  if (editor) editor.layout();
}

function closeTab(tabId, e) {
  if (e) e.stopPropagation();

  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const tab = tabs[tabIndex];
  if (tab.isDirty) {
    if (!confirm(`ไฟล์ "${tab.title}" ยังไม่ได้บันทึก ต้องการปิดหรือไม่?`)) {
      return;
    }
  }

  tab.model.dispose();
  tabs.splice(tabIndex, 1);

  if (tabs.length === 0) {
    createTab('ไฟล์ใหม่-1.pyknw', '');
    return;
  }

  if (activeTabId === tabId) {
    const nextIndex = Math.max(0, tabIndex - 1);
    switchTab(tabs[nextIndex].id);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  tabsContainer.innerHTML = '';

  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    const tamperedClass = tab.isTampered ? 'tampered' : '';
    tabEl.className = `code-tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''} ${tamperedClass}`;
    tabEl.onclick = () => switchTab(tab.id);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tab-file-icon';
    if (tab.isTampered) {
      iconSpan.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      tabEl.title = `ตรวจพบการแก้ไขจากโปรแกรมภายนอก: ${tab.tamperedReason || 'Notepad'}`;
    } else {
      iconSpan.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title;

    const dotSpan = document.createElement('span');
    dotSpan.className = 'tab-status-dot';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn';
    closeBtn.title = 'ปิดแท็บ (Ctrl+W)';
    closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12"><polygon fill="currentColor" points="11 1.41 9.59 0 5.5 4.09 1.41 0 0 1.41 4.09 5.5 0 9.59 1.41 11 5.5 6.91 9.59 11 11 9.59 6.91 5.5"></polygon></svg>`;
    closeBtn.onclick = (e) => closeTab(tab.id, e);

    tabEl.appendChild(iconSpan);
    tabEl.appendChild(titleSpan);
    tabEl.appendChild(dotSpan);
    tabEl.appendChild(closeBtn);

    tabsContainer.appendChild(tabEl);
  });

  tabCountStatusEl.textContent = `เปิดอยู่ ${tabs.length} แท็บ`;
}

function getCurrentTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

function updateTitleBar() {
  const current = getCurrentTab();
  if (current) {
    document.title = `${current.title} - PyKNW Studio`;
  }
}

// ==========================================
// Zoom Controls (Unified Source of Truth)
// ==========================================
let zoomToastTimeout = null;
let currentZoomToast = null;

function showZoomToast(message) {
  const container = document.getElementById('toastContainer');
  if (!currentZoomToast || !currentZoomToast.parentNode) {
    currentZoomToast = document.createElement('div');
    currentZoomToast.className = 'toast toast-info';
    container.appendChild(currentZoomToast);
  }
  currentZoomToast.textContent = message;
  currentZoomToast.style.opacity = '1';
  currentZoomToast.style.transform = 'translateY(0)';

  clearTimeout(zoomToastTimeout);
  zoomToastTimeout = setTimeout(() => {
    if (currentZoomToast && currentZoomToast.parentNode) {
      currentZoomToast.style.opacity = '0';
      currentZoomToast.style.transform = 'translateY(10px)';
      currentZoomToast.style.transition = 'all 0.2s ease';
      setTimeout(() => {
        if (currentZoomToast && currentZoomToast.parentNode) {
          currentZoomToast.parentNode.removeChild(currentZoomToast);
          currentZoomToast = null;
        }
      }, 200);
    }
  }, 1200);
}

// Editor Zoom (Ctrl + Plus, Ctrl + Minus, Ctrl + 0, or Ctrl + Scroll)
function zoomIn() {
  currentFontSize = Math.min(36, currentFontSize + 1);
  if (editor) editor.updateOptions({ fontSize: currentFontSize });
  updateZoomUI();
  showZoomToast(`ขยายหน้าโค้ด: ${Math.round((currentFontSize / DEFAULT_FONT_SIZE) * 100)}%`);
}

function zoomOut() {
  currentFontSize = Math.max(9, currentFontSize - 1);
  if (editor) editor.updateOptions({ fontSize: currentFontSize });
  updateZoomUI();
  showZoomToast(`ขยายหน้าโค้ด: ${Math.round((currentFontSize / DEFAULT_FONT_SIZE) * 100)}%`);
}

function resetZoom() {
  currentFontSize = DEFAULT_FONT_SIZE;
  if (editor) editor.updateOptions({ fontSize: currentFontSize });
  updateZoomUI();
  showZoomToast('ขยายหน้าโค้ด: 100%');
}

// Console Zoom - Controlled independently
function applyConsoleZoom() {
  if (outputBody) {
    outputBody.style.fontSize = `${currentConsoleFontSize}px`;
  }
}

function zoomConsoleInOnly() {
  currentConsoleFontSize = Math.min(32, currentConsoleFontSize + 1);
  applyConsoleZoom();
  showZoomToast(`ขนาดตัวอักษร Console: ${currentConsoleFontSize}px`);
}

function zoomConsoleOutOnly() {
  currentConsoleFontSize = Math.max(8, currentConsoleFontSize - 1);
  applyConsoleZoom();
  showZoomToast(`ขนาดตัวอักษร Console: ${currentConsoleFontSize}px`);
}

function updateZoomUI() {
  if (editorZoomEl) {
    const percent = Math.round((currentFontSize / DEFAULT_FONT_SIZE) * 100);
    editorZoomEl.textContent = `${percent}%`;
  }
}

// ==========================================
// Anti-External Copy-Paste Security System
// ==========================================
function setupClipboardShield() {
  editor.onKeyDown((e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // Capture Copy (Ctrl+C) or Cut (Ctrl+X)
    if (isCtrlOrCmd && (e.keyCode === monaco.KeyCode.KeyC || e.keyCode === monaco.KeyCode.KeyX)) {
      const selection = editor.getSelection();
      const selectedText = editor.getModel().getValueInRange(selection);
      if (selectedText) {
        internalClipboard = selectedText;
      }
    }

    // Capture Paste (Ctrl+V)
    if (isCtrlOrCmd && e.keyCode === monaco.KeyCode.KeyV) {
      e.preventDefault();
      e.stopPropagation();
      handleProtectedPaste();
    }
  });

  const container = document.getElementById('editorContainer');
  container.addEventListener('paste', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleProtectedPaste();
  }, true);

  // Block External Drag & Drop (Unless Teacher Mode is on)
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (isTeacherMode) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (isTeacherMode && e.dataTransfer) {
      const droppedText = e.dataTransfer.getData('text');
      if (droppedText && editor) {
        internalClipboard = droppedText;
        const position = editor.getPosition();
        editor.executeEdits('teacher-drop', [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: droppedText,
          forceMoveMarkers: true
        }]);
        showToast('ลากวางโค้ดสำเร็จ (โหมดครูผู้สอน)', 'success', 1500);
        return;
      }
    }
    showToast('การวางถูกบล็อก: ไม่อนุญาตให้ลากวางโค้ดจากภายนอก', 'warning');
  });
}

async function handleProtectedPaste() {
  try {
    let clipboardText = '';
    if (navigator.clipboard && navigator.clipboard.readText) {
      clipboardText = await navigator.clipboard.readText();
    }

    if (!clipboardText) return;

    // โหมดครูผู้สอน: อนุญาตให้วางโค้ดจากภายนอกได้โดยตรง
    if (isTeacherMode) {
      internalClipboard = clipboardText;
      const selection = editor.getSelection();
      editor.executeEdits('teacher-paste', [{
        range: selection,
        text: clipboardText,
        forceMoveMarkers: true
      }]);
      showToast('วางโค้ดจากภายนอกสำเร็จ (โหมดครูผู้สอน)', 'success', 1500);
      return;
    }

    // Compare with memory clipboard (โหมดนักเรียน)
    if (internalClipboard !== null && clipboardText === internalClipboard) {
      const selection = editor.getSelection();
      editor.executeEdits('internal-paste', [{
        range: selection,
        text: clipboardText,
        forceMoveMarkers: true
      }]);
      showToast('วางข้อความที่คัดลอกจากภายในสำเร็จ', 'success', 1500);
    } else {
      showToast('การวางถูกบล็อก: ไม่อนุญาตให้วางข้อความที่คัดลอกมาจากภายนอก', 'warning', 3500);
    }
  } catch (err) {
    showToast('ไม่สามารถตรวจสอบคลิปบอร์ดได้', 'warning');
  }
}

// ==========================================
// Console Layout Toggle (Bottom vs Right Side)
// ==========================================
function toggleConsoleLayout() {
  isDockRight = !isDockRight;

  if (isDockRight) {
    workspaceContainer.classList.remove('dock-bottom');
    workspaceContainer.classList.add('dock-right');
    outputSection.style.height = '100%';
    outputSection.style.width = '420px';
    dockText.textContent = 'แสดงด้านล่าง';
    dockIcon.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="15" x2="21" y2="15"></line>`;
  } else {
    workspaceContainer.classList.remove('dock-right');
    workspaceContainer.classList.add('dock-bottom');
    outputSection.style.width = '100%';
    outputSection.style.height = '230px';
    dockText.textContent = 'แสดงด้านข้าง';
    dockIcon.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line>`;
  }

  if (editor) editor.layout();
}

let isResizing = false;

panelResizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  panelResizer.classList.add('dragging');
  document.body.style.cursor = isDockRight ? 'ew-resize' : 'ns-resize';
});

window.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const rect = workspaceContainer.getBoundingClientRect();

  if (isDockRight) {
    const newWidth = rect.right - e.clientX;
    if (newWidth >= 180 && newWidth <= rect.width - 200) {
      outputSection.style.width = `${newWidth}px`;
      if (editor) editor.layout();
    }
  } else {
    const newHeight = rect.bottom - e.clientY;
    if (newHeight >= 70 && newHeight <= rect.height - 120) {
      outputSection.style.height = `${newHeight}px`;
      if (editor) editor.layout();
    }
  }
});

window.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    panelResizer.classList.remove('dragging');
    document.body.style.cursor = 'default';
    if (editor) editor.layout();
  }
});

// ==========================================
// Custom Window Controls (Frameless Titlebar)
// ==========================================
function setupWindowControls() {
  winMinBtn.addEventListener('click', () => window.pyknwAPI.minimizeWindow());
  winMaxBtn.addEventListener('click', async () => {
    const isMax = await window.pyknwAPI.maximizeWindow();
    updateMaxIcon(isMax);
  });
  winCloseBtn.addEventListener('click', () => window.pyknwAPI.closeWindow());

  window.pyknwAPI.onMaximizeChange((isMax) => {
    updateMaxIcon(isMax);
  });
}

function updateMaxIcon(isMax) {
  if (isMax) {
    winMaxIcon.innerHTML = `<path d="M3.5 1.5h7v7h-7z" fill="none" stroke="currentColor"/><path d="M1.5 3.5v7h7" fill="none" stroke="currentColor"/>`;
    winMaxBtn.title = 'ย่อขนาดหน้าต่าง';
  } else {
    winMaxIcon.innerHTML = `<rect fill="none" stroke="currentColor" width="9" height="9" x="1.5" y="1.5"></rect>`;
    winMaxBtn.title = 'ขยายเต็มหน้าจอ';
  }
}

// ==========================================
// Step Execution & Line Highlight Configuration
// ==========================================
const SPEED_OPTIONS = [
  { label: 'หน่วง: 0.3วิ', delay: 0.3 },
  { label: 'หน่วง: 0.6วิ (ช้า)', delay: 0.6 },
  { label: 'หน่วง: 0.1วิ (เร็ว)', delay: 0.1 },
  { label: 'ไม่หน่วงเวลา (เร็วสุด)', delay: 0 }
];
let currentSpeedIndex = 0;
let activeLineDecorationIds = [];
let lastExecutedLine = null;

function highlightLine(lineNum, isError = false) {
  if (!editor) return;
  lastExecutedLine = lineNum;
  activeLineDecorationIds = editor.deltaDecorations(activeLineDecorationIds, [
    {
      range: new monaco.Range(lineNum, 1, lineNum, 1),
      options: {
        isWholeLine: true,
        className: isError ? 'current-exec-line error-line' : 'current-exec-line',
        glyphMarginClassName: isError ? 'current-exec-glyph error-glyph' : 'current-exec-glyph'
      }
    }
  ]);
  editor.revealLineInCenterIfOutsideViewport(lineNum);
}

function clearHighlightLine() {
  if (!editor) return;
  lastExecutedLine = null;
  activeLineDecorationIds = editor.deltaDecorations(activeLineDecorationIds, []);
}

function cycleTraceSpeed() {
  currentSpeedIndex = (currentSpeedIndex + 1) % SPEED_OPTIONS.length;
  const current = SPEED_OPTIONS[currentSpeedIndex];
  traceSpeedLabel.textContent = current.label;
  btnTraceSpeed.classList.toggle('off', current.delay === 0);
  showToast(`ความเร็วไฮไลต์: ${current.label}`, 'info', 1000);
}

// ==========================================
// Python Execution
// ==========================================
async function runCode() {
  if (isRunning) return;
  const currentTab = getCurrentTab();
  if (!currentTab) return;

  // ตรวจจับการทุจริต: ไม่อนุญาตให้รันโค้ดที่แอบแก้ไขหรือนำเข้าจากภายนอก (ยกเว้นโหมดครูผู้สอน)
  if (currentTab.isTampered && !isTeacherMode) {
    showToast('ไม่อนุญาตให้รันโค้ด: ตรวจพบว่าไฟล์นี้ถูกสร้างหรือแก้ไขจากภายนอก (Notepad)', 'warning', 4500);
    updateTamperStatus();
    return;
  }

  // บังคับบันทึกไฟล์ก่อนสั่งรันเสมอ (ถ้าเคยเซฟแล้วจะเซฟทับทันที ถ้ายังไม่เคยเซฟจะถามปลายทาง)
  const saved = await saveCurrentFile(false);
  if (!saved) {
    showToast('กรุณาบันทึกไฟล์ก่อนสั่งรันโค้ด', 'warning', 2500);
    return;
  }

  const code = currentTab.model.getValue();
  isRunning = true;
  
  // Enable interactive input field for python input()
  setConsoleInputState(true);

  // Update unified Run/Stop button to Stop mode
  if (btnRunStop) {
    btnRunStop.className = 'tool-btn btn-stop';
    btnRunStop.title = 'หยุดการทำงาน (Stop)';
    runStopIcon.innerHTML = `<rect x="6" y="6" width="12" height="12"></rect>`;
    runStopText.textContent = 'หยุด';
  }

  clearHighlightLine();

  const currentDelay = SPEED_OPTIONS[currentSpeedIndex].delay;

  appendOutput(`\n--- เริ่มการประมวลผล [ ${currentTab.title} @ ${new Date().toLocaleTimeString()} ] ---\n`, 'system-line');

  try {
    await window.pyknwAPI.runCode(code, currentTab.filePath, currentDelay);
  } catch (err) {
    appendOutput(`\nข้อผิดพลาดในการประมวลผล: ${err.message}\n`, 'stderr');
    onExecutionFinished(-1, 0);
  }
}

async function stopCode() {
  if (!isRunning) return;
  setConsoleInputState(false);
  clearHighlightLine();
  const stopped = await window.pyknwAPI.stopCode();
  if (stopped) {
    appendOutput('\n[ การทำงานถูกหยุดโดยผู้ใช้ ]\n', 'stderr');
  }
}

function onExecutionFinished(code, elapsed) {
  isRunning = false;
  setConsoleInputState(false);

  // Restore unified Run/Stop button to Run mode
  if (btnRunStop) {
    btnRunStop.className = 'tool-btn btn-run';
    btnRunStop.title = 'รันไฟล์ปัจจุบัน (F5 หรือ Ctrl+Enter)';
    runStopIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
    runStopText.textContent = 'รัน';
  }

  if (code === 0) {
    clearHighlightLine();
    appendOutput(`\nการทำงานเสร็จสิ้นสมบูรณ์ (รหัส: ${code}) ใช้เวลา ${elapsed} วินาที\n`, 'exit-success');
  } else {
    // If execution exited with error, turn the error line to RED highlight
    if (lastExecutedLine) {
      highlightLine(lastExecutedLine, true);
    }
    appendOutput(`\nการทำงานสิ้นสุดด้วยข้อผิดพลาด (รหัส: ${code}) ใช้เวลา ${elapsed} วินาที\n`, 'exit-error');
  }
}

// IPC Listeners
window.pyknwAPI.onStep(line => highlightLine(line));
window.pyknwAPI.onStdout(text => appendOutput(text, 'stdout'));
window.pyknwAPI.onStderr(text => appendOutput(text, 'stderr'));
window.pyknwAPI.onExit(({ code, elapsed }) => onExecutionFinished(code, elapsed));

// App opened with a file from OS
window.pyknwAPI.onFileOpenedByOS((data) => {
  if (data && data.filePath) {
    createTab(getFileName(data.filePath), data.content, data.filePath, data.isTampered, data.tamperedReason);
  }
});

// ==========================================
// File Management
// ==========================================
function newFileTab() {
  createTab(`ไฟล์ใหม่-${tabCounter}.pyknw`, '# โค้ดภาษา Python (.pyknw)\n\n');
  showToast('สร้างแท็บใหม่แล้ว', 'info');
}

async function openFiles() {
  const fileList = await window.pyknwAPI.openFile();
  if (fileList && fileList.length > 0) {
    fileList.forEach(item => {
      const existing = tabs.find(t => t.filePath === item.filePath);
      if (existing) {
        existing.isTampered = !!item.isTampered;
        existing.tamperedReason = item.tamperedReason || null;
        switchTab(existing.id);
      } else {
        createTab(getFileName(item.filePath), item.content, item.filePath, item.isTampered, item.tamperedReason);
      }
    });
  }
}

async function saveCurrentFile(forceSaveAs = false) {
  const currentTab = getCurrentTab();
  if (!currentTab) return false;

  // ป้องกันการบันทึกทับเพื่อฟอกขาวโค้ดที่แอบแก้ไขจาก Notepad (ยกเว้นโหมดครูผู้สอน)
  if (currentTab.isTampered && !isTeacherMode) {
    showToast('ไม่อนุญาตให้บันทึกไฟล์นี้: ตรวจพบว่าไฟล์ถูกดัดแปลงจาก Notepad กรุณาสร้างแท็บไฟล์ใหม่เพื่อเขียนโค้ดด้วยตนเอง', 'warning', 5000);
    return false;
  }

  // หากเป็นโหมดครูผู้สอน ให้ปลดล็อกสถานะดัดแปลงเพื่อสร้างลายเซ็นใหม่
  if (isTeacherMode && currentTab.isTampered) {
    currentTab.isTampered = false;
    currentTab.tamperedReason = null;
  }

  const content = currentTab.model.getValue();

  if (!currentTab.filePath || forceSaveAs) {
    const defaultName = currentTab.filePath ? getFileName(currentTab.filePath) : currentTab.title;
    const selectedPath = await window.pyknwAPI.saveFileDialog(defaultName);
    if (!selectedPath) return false; // ผู้ใช้กดยกเลิก
    currentTab.filePath = selectedPath;
    currentTab.title = getFileName(selectedPath);
  }

  await window.pyknwAPI.saveFile(currentTab.filePath, content);
  currentTab.isDirty = false;
  renderTabs();
  updateTitleBar();
  updateTamperStatus();
  showToast(`บันทึกไฟล์ ${currentTab.title} เรียบร้อย (สร้างลายเซ็นความปลอดภัยแล้ว)`, 'success');
  return true;
}

function getFileName(pathStr) {
  return pathStr.replace(/^.*[\\\/]/, '');
}

// ==========================================
// Output & Interactive Console Input Helpers
// ==========================================
function appendOutput(text, type = 'stdout') {
  const lastElem = outputBody.lastElementChild;
  const isInline = !['system-line', 'prompt-line', 'exit-success', 'exit-error'].includes(type);

  if (lastElem && lastElem.dataset.type === type && isInline && !lastElem.dataset.ended) {
    lastElem.textContent += text;
    if (text.endsWith('\n')) {
      lastElem.dataset.ended = 'true';
    }
  } else {
    const chunk = document.createElement('span');
    chunk.className = `console-chunk ${type}`;
    chunk.dataset.type = type;
    chunk.textContent = text;
    if (text.endsWith('\n')) {
      chunk.dataset.ended = 'true';
    }
    outputBody.appendChild(chunk);
  }
  outputBody.scrollTop = outputBody.scrollHeight;
}

function clearOutput() {
  outputBody.innerHTML = '';
}

function setConsoleInputState(enabled) {
  if (!consoleInput || !btnSendInput) return;
  consoleInput.disabled = !enabled;
  btnSendInput.disabled = !enabled;

  if (enabled) {
    consoleInput.placeholder = 'พิมพ์ข้อมูลที่นี่ แล้วกด Enter หรือคลิก [ส่ง] เพื่อส่งให้คำสั่ง input()...';
    // Automatically focus the input box so the user can type immediately
    setTimeout(() => consoleInput.focus(), 50);
  } else {
    consoleInput.placeholder = 'โปรแกรมไม่ได้กำลังทำงาน (กด [รัน] เพื่อเริ่มโปรแกรม)...';
    consoleInput.value = '';
  }
}

async function sendConsoleInput(e) {
  if (e) e.preventDefault();
  if (!isRunning || !consoleInput || consoleInput.disabled) return;

  const value = consoleInput.value;
  consoleInput.value = '';

  // Echo to console in a distinguished color so the user clearly sees what was input
  appendOutput(`${value}\n`, 'stdin-echo');

  try {
    await window.pyknwAPI.sendStdin(value);
  } catch (err) {
    appendOutput(`\nข้อผิดพลาดในการส่งข้อมูล: ${err.message}\n`, 'stderr');
  }

  if (isRunning && consoleInput && !consoleInput.disabled) {
    consoleInput.focus();
  }
}

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  }, duration);
}

// ==========================================
// Comprehensive Hotkeys Configuration
// ==========================================
function setupShortcuts() {
  window.addEventListener('keydown', (e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    // 1. Run: F5 or Ctrl + Enter
    if (e.key === 'F5' || (isCtrlOrCmd && e.key === 'Enter')) {
      e.preventDefault();
      runCode();
      return;
    }

    if (isCtrlOrCmd) {
      // 2. Save As: Ctrl + Shift + S
      if (isShift && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveCurrentFile(true);
        return;
      }

      // 3. Save: Ctrl + S
      if (!isShift && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveCurrentFile(false);
        return;
      }

      // 4. Open: Ctrl + O
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        openFiles();
        return;
      }

      // 5. New File Tab: Ctrl + N
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        newFileTab();
        return;
      }

      // 6. Close Current Tab: Ctrl + W
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      // 7. Zoom In: Ctrl + Plus / Ctrl + Equal / Ctrl + NumpadAdd
      if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        zoomIn();
        return;
      }

      // 8. Zoom Out: Ctrl + Minus / Ctrl + NumpadSubtract
      if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        zoomOut();
        return;
      }

      // 9. Reset Zoom: Ctrl + 0 / Ctrl + Numpad0
      if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        resetZoom();
        return;
      }
    }
  });
}

// Event Listeners
btnNewTab.addEventListener('click', newFileTab);
btnNew.addEventListener('click', newFileTab);
btnOpen.addEventListener('click', openFiles);
btnSave.addEventListener('click', () => saveCurrentFile(false));
if (btnSaveAs) btnSaveAs.addEventListener('click', () => saveCurrentFile(true));
if (btnRunStop) btnRunStop.addEventListener('click', () => { if (isRunning) stopCode(); else runCode(); });
if (btnTraceSpeed) btnTraceSpeed.addEventListener('click', cycleTraceSpeed);
btnClear.addEventListener('click', clearOutput);
btnToggleLayout.addEventListener('click', toggleConsoleLayout);

if (btnConsoleZoomIn) btnConsoleZoomIn.addEventListener('click', zoomConsoleInOnly);
if (btnConsoleZoomOut) btnConsoleZoomOut.addEventListener('click', zoomConsoleOutOnly);

// Editor MouseWheel Zoom (Ctrl + Wheel) - Uses exact same zoomIn/zoomOut as Hotkeys
const editorContainer = document.getElementById('editorContainer');
let editorWheelDelta = 0;
const WHEEL_SENSITIVITY = 40;

editorContainer.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();

    editorWheelDelta += e.deltaY;
    if (editorWheelDelta <= -WHEEL_SENSITIVITY) {
      zoomIn();
      editorWheelDelta = 0;
    } else if (editorWheelDelta >= WHEEL_SENSITIVITY) {
      zoomOut();
      editorWheelDelta = 0;
    }
  }
}, { passive: false });

// Console MouseWheel Zoom (Ctrl + Wheel)
let consoleWheelDelta = 0;
outputBody.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();

    consoleWheelDelta += e.deltaY;
    if (consoleWheelDelta <= -WHEEL_SENSITIVITY) {
      zoomConsoleInOnly();
      consoleWheelDelta = 0;
    } else if (consoleWheelDelta >= WHEEL_SENSITIVITY) {
      zoomConsoleOutOnly();
      consoleWheelDelta = 0;
    }
  }
}, { passive: false });

// Interactive Console Input Listeners
if (consoleInputForm) {
  consoleInputForm.addEventListener('submit', sendConsoleInput);
}

// When clicking anywhere in the output area while code is running, auto-focus input
if (outputBody) {
  outputBody.addEventListener('click', () => {
    if (isRunning && consoleInput && !consoleInput.disabled) {
      consoleInput.focus();
    }
  });
}

// ==========================================
// Auto-Updater Controller
// ==========================================
let availableUpdateInfo = null;
let isUpdatingNow = false;

const btnToolbarUpdate = document.getElementById('btnToolbarUpdate');
const toolbarUpdateText = document.getElementById('toolbarUpdateText');
const updateModalBackdrop = document.getElementById('updateModalBackdrop');
const btnUpdateModalClose = document.getElementById('btnUpdateModalClose');
const updateCurrentVer = document.getElementById('updateCurrentVer');
const updateLatestVer = document.getElementById('updateLatestVer');
const updateReleaseNotes = document.getElementById('updateReleaseNotes');
const updateProgressSection = document.getElementById('updateProgressSection');
const updateProgressStatus = document.getElementById('updateProgressStatus');
const updateProgressPercent = document.getElementById('updateProgressPercent');
const updateProgressBarFill = document.getElementById('updateProgressBarFill');
const updateProgressDetails = document.getElementById('updateProgressDetails');
const updateModalFooter = document.getElementById('updateModalFooter');
const btnUpdateLater = document.getElementById('btnUpdateLater');
const btnUpdateNow = document.getElementById('btnUpdateNow');

function showUpdateModal(info) {
  if (!info) return;
  availableUpdateInfo = info;

  updateCurrentVer.textContent = `v${info.currentVersion}`;
  updateLatestVer.textContent = `v${info.newVersion}`;
  updateReleaseNotes.textContent = info.releaseNotes || 'ไม่มีบันทึกการเปลี่ยนแปลง';

  if (toolbarUpdateText) {
    toolbarUpdateText.textContent = `อัปเดต (v${info.newVersion})`;
  }

  // Reset progress section
  updateProgressSection.style.display = 'none';
  updateProgressBarFill.style.width = '0%';
  updateProgressPercent.textContent = '0%';
  updateProgressStatus.textContent = 'กำลังดาวน์โหลดไฟล์ติดตั้ง...';
  updateProgressDetails.textContent = '';

  btnUpdateLater.disabled = false;
  btnUpdateNow.disabled = false;
  btnUpdateNow.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
    <span>${info.isDirectInstaller ? 'อัปเดตทันที' : 'เปิดหน้าดาวน์โหลด'}</span>
  `;

  updateModalBackdrop.style.display = 'flex';
}

function dismissUpdateModal() {
  if (isUpdatingNow) {
    showToast('กำลังดำเนินการดาวน์โหลดอัปเดต กรุณารอสักครู่...', 'info', 2000);
    return;
  }

  updateModalBackdrop.style.display = 'none';

  // เมื่อผู้ใช้กดปิด ให้แสดงปุ่มอัปเดตไว้ที่ Toolbar ทันที เพื่อให้กดอัปเดตเมื่อไหร่ก็ได้
  if (availableUpdateInfo && btnToolbarUpdate) {
    btnToolbarUpdate.style.display = 'inline-flex';
    showToast(`คุณสามารถกดปุ่ม [อัปเดต (v${availableUpdateInfo.newVersion})] บนแถบเครื่องมือได้ตลอดเวลา`, 'info', 4000);
  }
}

async function startUpdateProcess() {
  if (!availableUpdateInfo || isUpdatingNow) return;

  if (!availableUpdateInfo.isDirectInstaller) {
    // กรณีไม่มีไฟล์ .exe ให้ดาวน์โหลดโดยตรง ให้เปิดหน้า Release บนเบราว์เซอร์
    await window.pyknwAPI.openUpdateUrl(availableUpdateInfo.htmlUrl);
    dismissUpdateModal();
    return;
  }

  isUpdatingNow = true;
  updateProgressSection.style.display = 'flex';
  btnUpdateLater.disabled = true;
  btnUpdateNow.disabled = true;
  btnUpdateNow.innerHTML = `<span>กำลังดาวน์โหลด...</span>`;

  try {
    const res = await window.pyknwAPI.startUpdateDownload(availableUpdateInfo);
    if (!res || !res.success) {
      throw new Error(res?.error || 'เกิดข้อผิดพลาดในการดาวน์โหลด');
    }
  } catch (err) {
    isUpdatingNow = false;
    btnUpdateLater.disabled = false;
    btnUpdateNow.disabled = false;
    btnUpdateNow.innerHTML = `<span>ลองใหม่อีกครั้ง</span>`;
    showToast(`การอัปเดตล้มเหลว: ${err.message}`, 'warning', 4000);
  }
}

// IPC Listeners for Updater
if (window.pyknwAPI) {
  if (window.pyknwAPI.onUpdateAvailable) {
    window.pyknwAPI.onUpdateAvailable((info) => {
      showUpdateModal(info);
    });
  }

  if (window.pyknwAPI.onUpdateDownloadProgress) {
    window.pyknwAPI.onUpdateDownloadProgress(({ percent, downloaded, total }) => {
      updateProgressBarFill.style.width = `${percent}%`;
      updateProgressPercent.textContent = `${percent}%`;
      updateProgressDetails.textContent = `${downloaded} / ${total}`;
    });
  }

  if (window.pyknwAPI.onUpdateDownloadComplete) {
    window.pyknwAPI.onUpdateDownloadComplete(() => {
      updateProgressStatus.textContent = 'ดาวน์โหลดเสร็จสมบูรณ์! กำลังเริ่มการติดตั้ง...';
      updateProgressPercent.textContent = '100%';
      updateProgressBarFill.style.width = '100%';
    });
  }

  if (window.pyknwAPI.onUpdateError) {
    window.pyknwAPI.onUpdateError(({ message }) => {
      showToast(message, 'warning', 4000);
    });
  }

  if (window.pyknwAPI.onUpdateNotAvailable) {
    window.pyknwAPI.onUpdateNotAvailable(({ message }) => {
      showToast(message, 'info', 3000);
    });
  }
}

// Event Listeners for Update UI
if (btnToolbarUpdate) {
  btnToolbarUpdate.addEventListener('click', () => {
    if (availableUpdateInfo) {
      showUpdateModal(availableUpdateInfo);
    }
  });
}

if (btnUpdateModalClose) {
  btnUpdateModalClose.addEventListener('click', dismissUpdateModal);
}

if (btnUpdateLater) {
  btnUpdateLater.addEventListener('click', dismissUpdateModal);
}

if (btnUpdateNow) {
  btnUpdateNow.addEventListener('click', startUpdateProcess);
}

// Close modal on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && updateModalBackdrop.style.display === 'flex') {
    dismissUpdateModal();
  }

  // Ctrl + Shift + U: ทดสอบจำลองการตรวจพบอัปเดต (Simulation Mode)
  if (e.ctrlKey && e.shiftKey && (e.key === 'u' || e.key === 'U')) {
    e.preventDefault();
    if (window.pyknwAPI && window.pyknwAPI.simulateMockUpdate) {
      window.pyknwAPI.simulateMockUpdate();
    }
  }
});

// Initialize App Version in Status Bar
if (window.pyknwAPI && window.pyknwAPI.getAppVersion) {
  window.pyknwAPI.getAppVersion().then(ver => {
    if (appVersionStatus && ver) {
      appVersionStatus.textContent = `v${ver}`;
    }
  }).catch(() => {});
}

// Click version in Status Bar to check for updates or open update modal
if (appVersionStatus) {
  appVersionStatus.addEventListener('click', () => {
    if (availableUpdateInfo) {
      showUpdateModal(availableUpdateInfo);
    } else if (window.pyknwAPI && window.pyknwAPI.checkForUpdates) {
      showToast('กำลังตรวจสอบการอัปเดตเวอร์ชันล่าสุด...', 'info', 2000);
      window.pyknwAPI.checkForUpdates();
    }
  });
}

// ==========================================
// Secret Teacher Mode (GTA-Style Cheat Codes)
// ==========================================
let isTeacherMode = false;
let cheatInputBuffer = '';
let cheatBufferTimeout = null;
const CHEAT_CODES = ['TEACHER', 'HESOYAM', 'PROFESSOR'];

const teacherBadge = document.getElementById('teacherBadge');
const teacherSep = document.getElementById('teacherSep');

function toggleTeacherMode() {
  isTeacherMode = !isTeacherMode;

  if (teacherBadge) teacherBadge.style.display = isTeacherMode ? 'inline-flex' : 'none';
  if (teacherSep) teacherSep.style.display = isTeacherMode ? 'inline' : 'none';

  if (isTeacherMode) {
    showToast('ปลดล็อกโหมดครูผู้สอน (Teacher Mode): อนุญาตให้วางโค้ดจากภายนอกได้', 'success', 3500);
    const currentTab = getCurrentTab();
    if (currentTab && currentTab.isTampered && btnRunStop) {
      btnRunStop.classList.remove('blocked');
      btnRunStop.title = 'รันโค้ด (โหมดครูผู้สอนอนุญาต)';
    }
  } else {
    showToast('ปิดโหมดครูผู้สอน: ระบบบล็อกการวางจากภายนอกกลับมาทำงานตามปกติ', 'info', 2500);
    updateTamperStatus();
  }
}

// Click on teacher badge in status bar to toggle off
if (teacherBadge) {
  teacherBadge.addEventListener('click', toggleTeacherMode);
}

// Global Listener for GTA-Style Secret Cheat Codes & Secret Hotkeys
window.addEventListener('keydown', (e) => {
  // 1. Secret Hotkey: Ctrl + Alt + T
  if (e.ctrlKey && e.altKey && (e.key === 't' || e.key === 'T')) {
    e.preventDefault();
    toggleTeacherMode();
    return;
  }

  // 2. GTA-Style sequential typing (TEACHER or HESOYAM)
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && /[a-zA-Z]/i.test(e.key)) {
    cheatInputBuffer += e.key.toUpperCase();

    if (cheatInputBuffer.length > 20) {
      cheatInputBuffer = cheatInputBuffer.slice(-20);
    }

    for (const code of CHEAT_CODES) {
      if (cheatInputBuffer.endsWith(code)) {
        cheatInputBuffer = '';

        // If the cheat code was typed inside Monaco Editor, automatically erase the typed keyword!
        if (editor && editor.hasTextFocus()) {
          const selection = editor.getSelection();
          const startCol = Math.max(1, selection.endColumn - code.length);
          const rangeToDelete = new monaco.Range(
            selection.endLineNumber,
            startCol,
            selection.endLineNumber,
            selection.endColumn
          );
          const textInRange = editor.getModel().getValueInRange(rangeToDelete);
          if (textInRange.toUpperCase() === code) {
            editor.executeEdits('cheat-erase', [{
              range: rangeToDelete,
              text: '',
              forceMoveMarkers: true
            }]);
          }
        }

        toggleTeacherMode();
        break;
      }
    }

    clearTimeout(cheatBufferTimeout);
    cheatBufferTimeout = setTimeout(() => {
      cheatInputBuffer = '';
    }, 4000);
  }
}, true);
