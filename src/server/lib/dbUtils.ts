import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

/**
 * Ensures that a user profile exists in the public.users table.
 * This prevents Foreign Key constraint violations when inserting files or folders.
 */
export async function ensureUserProfile(userId: string, email: string = '', name: string = '', token?: string) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    
    const isServiceKey = !!supabaseServiceKey;
    
    // Create a client for this operation. 
    // If we have a service key, use it (RLS bypass).
    // Otherwise, use the anon key with the user's token (RLS enabled but auth.uid() set).
    let client = supabase;
    if (isServiceKey) {
      client = supabase; // global supabase already uses service key if available
    } else if (token) {
      client = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
    }

    // We prioritize using the best available client.
    const { data: profileById, error: selectIdError } = await client
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();

    if (selectIdError) {
      console.error(`[dbUtils] Error checking profile by ID for ${userId}:`, selectIdError.message);
    }

    if (profileById) {
      // Profile exists with correct ID. Ensure email is synced.
      if (email && profileById.email !== email && isServiceKey) {
        console.log(`[dbUtils] Syncing email for ${userId}: ${profileById.email} -> ${email}`);
        await supabase.from('users').update({ email }).eq('id', userId);
      }
      return true;
    }

    // Profile doesn't exist by ID. Check if it exists by email.
    console.log(`[dbUtils] Profile missing for ID ${userId}. Checking by email ${email}...`);
    const { data: profileByEmail, error: selectEmailError } = await client
      .from('users')
      .select('id, name')
      .eq('email', email)
      .maybeSingle();

    if (selectEmailError) {
      console.error(`[dbUtils] Error checking profile by email for ${email}:`, selectEmailError.message);
    }

    if (profileByEmail) {
      console.log(`[dbUtils] Profile found with existing email ${email} but different ID: ${profileByEmail.id}. Current ID: ${userId}`);
      
      if (isServiceKey) {
        console.log(`[dbUtils] Service Key available. Attempting to update ID ${profileByEmail.id} -> ${userId}...`);
        // We try to update the ID. If it fails due to FKs, we might need a different strategy.
        const { error: syncError } = await supabase
          .from('users')
          .update({ id: userId, updated_at: new Date().toISOString() })
          .eq('id', profileByEmail.id);

        if (!syncError) {
          console.log(`[dbUtils] ID Sync successful. Profile ${profileByEmail.id} remapped to ${userId}.`);
          return true;
        }

        console.error(`[dbUtils] ID Sync failed:`, syncError.message);
        
        // If ID sync fails (likely FK constraint), we'll try to update the email of the old record
        // to a "deleted" state and create a new record for the new ID.
        // This is a last resort to allow the user to login.
        console.log(`[dbUtils] Attempting fallback: deprecating old record email...`);
        const deprecatedEmail = `deprecated_${Date.now()}_${email}`;
        await supabase.from('users').update({ email: deprecatedEmail }).eq('id', profileByEmail.id);
      } else {
        console.warn(`[dbUtils] CANNOT SYNC: Missing service key. Profile for ${email} is tied to ID ${profileByEmail.id}.`);
        return false;
      }
    }

    // Now attempt to create the new profile
    console.log(`[dbUtils] Creating new profile for ${userId} (${email})...`);
    
    const isAdminEmail = email === 'admin@gmail.com' || email === 'garlapatitejaswini9@gmail.com';
    
    const profileData: any = {
      id: userId,
      email: email || '',
      name: name || email?.split('@')[0] || 'User',
      role: isAdminEmail ? 'admin' : 'user',
      updated_at: new Date().toISOString()
    };

    const { error: insertError } = await client
      .from('users')
      .insert(profileData);

    if (insertError) {
      console.error(`[dbUtils] Final profile creation failed for ${userId}:`, insertError.message);
      return false;
    }

    console.log(`[dbUtils] Profile created for ${userId}.`);
    return true;
  } catch (err: any) {
    console.error(`[dbUtils] Unexpected error in ensureUserProfile for ${userId}:`, err.message);
    return false;
  }
}
