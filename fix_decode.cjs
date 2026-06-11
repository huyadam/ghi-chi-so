const fs = require('fs');
const f = 'src/components/UpdateReading.tsx';
const buf = fs.readFileSync(f);

// Try decoding: read bytes as latin1, then re-interpret as UTF-8
// This fixes double-encoding: original UTF-8 → saved as latin1 → re-saved as UTF-8
const latin1 = buf.toString('latin1');

// Check if it looks double-encoded
if (latin1.includes('\u00C3') || latin1.includes('\u00C4') || latin1.includes('\u00C6')) {
  // Convert latin1 interpretation back to proper UTF-8
  const properBuf = Buffer.from(latin1, 'latin1');
  const utf8 = properBuf.toString('utf8');
  
  // Verify it fixed things
  if (utf8.includes('Phân công') || utf8.includes('Tự đăng ký') || utf8.includes('Không có')) {
    fs.writeFileSync(f, utf8, 'utf8');
    console.log('SUCCESS: File re-decoded and saved as UTF-8');
    
    // Sample output
    const lines = utf8.split('\n');
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      if (/[àáảãạăắặẳẵâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđĐ]/.test(lines[i])) {
        console.log(`Line ${i+1}: ${lines[i].trim().substring(0, 80)}`);
      }
    }
  } else {
    console.log('WARN: Re-decode did not produce expected Vietnamese text');
    console.log('Sample:', utf8.substring(0, 300));
  }
} else {
  console.log('File does not appear to be double-encoded');
}
