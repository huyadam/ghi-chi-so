const {createClient} = require('@supabase/supabase-js');
const s = createClient(
  'https://tfgbffnnshwtslmenajv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmZ2JmZm5uc2h3dHNsbWVuYWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTU5MjIsImV4cCI6MjA5NTM5MTkyMn0.pYMuc5Czi_yCa3LxPmw-fgGDlLm4bB2VnO_1M4lMNVU'
);

async function check() {
  // Get some MA_TRAM from customers
  const {data: custs} = await s.from('customers').select('MA_TRAM').limit(5);
  const maTrams = custs.map(c => c.MA_TRAM).filter(Boolean);
  console.log('Sample MA_TRAM from customers:', maTrams);

  // Check if they match TBTID in stations
  const {data: stations} = await s.from('stations').select('TBTID, "Tên TBA"').in('TBTID', maTrams);
  console.log('Matching stations:', stations ? stations.length : 0);
  if (stations) stations.forEach(st => console.log(`  TBTID=${st.TBTID} → ${st['Tên TBA']}`));
}
check();
