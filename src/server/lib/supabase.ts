import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseKey = supabaseServiceKey || supabaseAnonKey;
const isServiceKey = !!supabaseServiceKey;

if (!supabaseUrl || !supabaseKey) {
  console.warn('CRITICAL: Supabase URL or Key missing.');
}

if (isServiceKey) {
  console.log('SERVER: initializing Supabase with SERVICE_ROLE_KEY (RLS Bypass enabled)');
} else if (supabaseAnonKey) {
  console.warn('SERVER: initializing Supabase with ANON_KEY (subject to RLS)');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
