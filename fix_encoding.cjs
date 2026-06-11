const fs = require('fs');
const f = 'src/components/UpdateReading.tsx';
const buf = fs.readFileSync(f);

// Remove BOM if present
let start = 0;
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) start = 3;

// Read as latin1 (the broken encoding), then create proper UTF-8
const broken = buf.slice(start).toString('latin1');

// Fix: interpret the latin1 bytes as UTF-8
const fixed = Buffer.from(broken, 'latin1').toString('utf8');

// Check
console.log('Before:', broken.substring(0, 200));
console.log('---');
console.log('After:', fixed.substring(0, 200));

// Save with proper UTF-8 (no BOM)
fs.writeFileSync(f, fixed, 'utf8');
console.log('Done! File saved as UTF-8.');
