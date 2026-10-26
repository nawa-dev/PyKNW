// PyKNW Studio - File Integrity & Container Security Manager
const crypto = require('crypto');

// Secret salt for HMAC digital signature
const SECRET_KEY = 'PyKNW-STUDIO-INTEGRITY-KEY-2026-NAWAPHAN-DEV-SECURE';

/**
 * Normalize line endings for consistent hashing across platforms
 */
function normalizeCode(code) {
  return (code || '').replace(/\r\n/g, '\n').trimEnd();
}

/**
 * Compute cryptographic HMAC-SHA256 signature
 */
function computeSignature(code) {
  const normalized = normalizeCode(code);
  return crypto.createHmac('sha256', SECRET_KEY).update(normalized, 'utf-8').digest('hex');
}

/**
 * Pack Python code into secure PyKNW container
 */
function packContainer(code) {
  const normalized = normalizeCode(code);
  const signature = computeSignature(normalized);
  const payload = Buffer.from(code, 'utf-8').toString('base64');

  return {
    format: 'pyknw-container',
    version: '1.0',
    app: 'PyKNW Studio',
    timestamp: new Date().toISOString(),
    signature,
    payload
  };
}

/**
 * Unpack and verify PyKNW container from disk
 */
function unpackContainer(rawText, filePath = '') {
  // If it's a standard .py file, treat as normal code without container requirement
  if (!filePath || !filePath.toLowerCase().endsWith('.pyknw')) {
    return {
      code: rawText,
      isTampered: false,
      isContainer: false
    };
  }

  // Attempt to parse container format
  try {
    const data = JSON.parse(rawText);
    if (data && data.format === 'pyknw-container' && typeof data.payload === 'string' && typeof data.signature === 'string') {
      const decodedCode = Buffer.from(data.payload, 'base64').toString('utf-8');
      const expectedSig = computeSignature(decodedCode);

      if (data.signature === expectedSig) {
        return {
          code: decodedCode,
          isTampered: false,
          isContainer: true,
          savedAt: data.timestamp
        };
      } else {
        return {
          code: decodedCode,
          isTampered: true,
          isContainer: true,
          reason: 'ลายเซ็นดิจิทัลไม่ตรงกับเนื้อหาโค้ด (ตรวจพบการแก้ไขหรือวางโค้ดจาก Notepad)'
        };
      }
    }
  } catch (err) {
    // Not valid JSON container (student pasted raw code or created file in Notepad)
  }

  return {
    code: rawText,
    isTampered: true,
    isContainer: false,
    reason: 'โครงสร้างไฟล์ไม่ถูกต้อง (ไฟล์นี้ถูกสร้างหรือเขียนทับจากโปรแกรมภายนอก ไม่ได้บันทึกจาก PyKNW Studio)'
  };
}

module.exports = {
  packContainer,
  unpackContainer,
  computeSignature
};
