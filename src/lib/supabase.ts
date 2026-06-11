import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase chưa được cấu hình. Vui lòng set VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
