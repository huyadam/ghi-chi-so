const fs = require('fs');
const files = ['src/components/Layout.tsx', 'src/components/UpdateReading.tsx', 'src/components/Login.tsx'];
files.forEach(f => {
  const buf = fs.readFileSync(f);
  // Check for BOM
  const hasBOM = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  // Find Vietnamese text
  const text = buf.toString('utf8');
  const match = text.match(/[àáảãạăắặẳẵâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđ]/i);
  console.log(`${f}: BOM=${hasBOM}, Vietnamese=${!!match}, Size=${buf.length}`);
  if (match) {
    const idx = text.indexOf(match[0]);
    console.log(`  Sample: "${text.substring(Math.max(0,idx-10), idx+20)}"`);
  }
});
