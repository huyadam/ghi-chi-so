const fs = require('fs');
const t = fs.readFileSync('src/components/UpdateReading.tsx', 'utf8');
const lines = t.split('\n');
// Show lines around getStationName
for (let i = 28; i <= 35; i++) {
  console.log(`Line ${i+1}: ${lines[i]}`);
}
// Check hex of line 32
const line32 = lines[31];
console.log('\nHex of line 32:', Buffer.from(line32, 'utf8').toString('hex'));
