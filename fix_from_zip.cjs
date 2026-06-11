const fs = require('fs');
const path = require('path');

const origDir = 'D:/OneDrive - EVNHCMC/Máy tính/PC Vũng Tàu/2026/App/Antigravity_PCVT/data/Web app/Ghichiso/temp_extract/ghi-chi-so-pcvt-main';
const destDir = 'D:/OneDrive - EVNHCMC/Máy tính/PC Vũng Tàu/2026/App/Antigravity_PCVT/data/Web app/Ghichiso/extracted/ghi-chi-so-pcvt-main';

// Get original file
const origFile = path.join(origDir, 'src/components/UpdateReading.tsx');
const destFile = path.join(destDir, 'src/components/UpdateReading.tsx');

const origBuf = fs.readFileSync(origFile);
console.log('Original file size:', origBuf.length);
console.log('Has BOM:', origBuf[0] === 0xEF && origBuf[1] === 0xBB && origBuf[2] === 0xBF);

// Read as latin1 and decode as UTF-8
let start = 0;
if (origBuf[0] === 0xEF && origBuf[1] === 0xBB && origBuf[2] === 0xBF) start = 3;

const latin1 = origBuf.slice(start).toString('latin1');
const utf8 = Buffer.from(latin1, 'latin1').toString('utf8');

// Check
const lines = utf8.split('\n');
let vietCount = 0;
let mojiCount = 0;
for (const line of lines) {
  if (/[àáảãạăắặẳẵâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđĐ]/.test(line)) vietCount++;
  if (/Ã[¡©­³ºÃ¢ª]/.test(line)) mojiCount++;
}
console.log('Vietnamese lines:', vietCount);
console.log('Mojibake lines:', mojiCount);

if (vietCount > 0 && mojiCount === 0) {
  fs.writeFileSync(destFile, utf8, 'utf8');
  console.log('SUCCESS: Saved clean UTF-8 file');
} else if (mojiCount > 0) {
  // Try second decode
  const latin2 = Buffer.from(utf8, 'utf8').toString('latin1');
  const utf8_2 = Buffer.from(latin2, 'latin1').toString('utf8');
  let moji2 = 0;
  for (const line of utf8_2.split('\n')) {
    if (/Ã[¡©­³ºÃ¢ª]/.test(line)) moji2++;
  }
  console.log('After 2nd decode, mojibake lines:', moji2);
  if (moji2 === 0) {
    fs.writeFileSync(destFile, utf8_2, 'utf8');
    console.log('SUCCESS after 2nd decode');
  }
} else {
  console.log('No Vietnamese text found - something is wrong');
}

// Final verify
const final = fs.readFileSync(destFile, 'utf8');
const sample = final.split('\n').filter(l => /[àáảãạăắặẳẵâấầẩẫậèéẹẻẽêếềểễệ]/.test(l)).slice(0, 5);
console.log('\nSample Vietnamese lines:');
sample.forEach((l, i) => console.log(`  ${i+1}: ${l.trim().substring(0, 80)}`));
