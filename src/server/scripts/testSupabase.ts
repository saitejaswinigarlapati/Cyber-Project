import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const isServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testSupabase() {
  console.log('--- Supabase Connection Test ---');
  console.log(`URL: ${supabaseUrl ? 'Present' : 'MISSING'}`);
  console.log(`Key: ${supabaseKey ? 'Present' : 'MISSING'}`);
  console.log(`Key Type: ${isServiceKey ? 'SERVICE_ROLE (Bypasses RLS)' : 'ANON (Subject to RLS)'}`);

  if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: Supabase URL or Key is missing.');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('\n1. Testing Auth connection...');
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.error('Auth Test Failed:', authError.message);
    } else {
      console.log('Auth Test Passed.');
    }

    console.log('\n2. Testing Database access (users table)...');
    const { data: userData, error: userError } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (userError) {
      console.error('Database Test Failed:', userError.message);
      if (userError.message.includes('row-level security')) {
        console.warn('ADVICE: You are hitting RLS. Ensure you have applied the schema in supabase_schema.sql or provided the SERVICE_ROLE_KEY.');
      }
    } else {
      console.log('Database Test Passed. Entry count:', userData);
    }

    console.log('\n--- Test Complete ---');
  } catch (err: any) {
    console.error('Unexpected error during test:', err);
  }
}

testSupabase();
