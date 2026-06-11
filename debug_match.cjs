const {createClient} = require('@supabase/supabase-js');
const s = createClient(
  'https://tfgbffnnshwtslmenajv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmZ2JmZm5uc2h3dHNsbWVuYWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTU5MjIsImV4cCI6MjA5NTM5MTkyMn0.pYMuc5Czi_yCa3LxPmw-fgGDlLm4bB2VnO_1M4lMNVU'
);

async function debug() {
  // Get sample MA_TRAM from customers
  const {data: custs} = await s.from('customers').select('MA_TRAM').not('MA_TRAM', 'is', null).limit(5);
  console.log('=== Customers MA_TRAM ===');
  custs.forEach(c => console.log(`  "${c.MA_TRAM}" (type: ${typeof c.MA_TRAM})`));
  
  // Get sample TBTID from stations  
  const {data: stats} = await s.from('stations').select('TBTID, "Tên TBA"').limit(5);
  console.log('\n=== Stations TBTID ===');
  stats.forEach(st => console.log(`  "${st.TBTID}" (type: ${typeof st.TBTID}) → ${st['Tên TBA']}`));
  
  // Try exact match
  const testMaTram = custs[0].MA_TRAM;
  console.log(`\n=== Test match: MA_TRAM="${testMaTram}" ===`);
  const match = stats.find(st => st.TBTID === testMaTram);
  console.log('Strict === match:', match ? 'YES' : 'NO');
  const matchLoose = stats.find(st => String(st.TBTID) === String(testMaTram));
  console.log('String() match:', matchLoose ? 'YES' : 'NO');
  
  // Query station with that specific TBTID
  const {data: directMatch} = await s.from('stations').select('TBTID, "Tên TBA"').eq('TBTID', testMaTram);
  console.log('Direct DB query match:', directMatch ? directMatch.length : 0, 'results');
  if (directMatch && directMatch.length > 0) {
    console.log('  →', directMatch[0]['Tên TBA']);
  }

  // Count total stations
  const {count} = await s.from('stations').select('*', {count: 'exact', head: true});
  console.log('\nTotal stations in DB:', count);
}
debug();
