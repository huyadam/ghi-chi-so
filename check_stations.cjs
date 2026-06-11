const {createClient} = require('@supabase/supabase-js');
const s = createClient(
  'https://tfgbffnnshwtslmenajv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmZ2JmZm5uc2h3dHNsbWVuYWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTU5MjIsImV4cCI6MjA5NTM5MTkyMn0.pYMuc5Czi_yCa3LxPmw-fgGDlLm4bB2VnO_1M4lMNVU'
);

s.from('stations').select('*').limit(2).then(r => {
  if (r.data && r.data.length > 0) {
    console.log('Columns:', Object.keys(r.data[0]).join(', '));
    console.log('\nSample 1:', JSON.stringify(r.data[0], null, 2));
  } else {
    console.log('No data or error:', r.error);
  }
});
