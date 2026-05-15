import { Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase as globalSupabase } from '../lib/supabase.ts';
import { ensureUserProfile } from '../lib/dbUtils.ts';

export const authMiddleware = async (req: any, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // 1. Validate the token and get the user from Supabase
    const { data: { user }, error } = await globalSupabase.auth.getUser(token as string);
    
    if (error || !user) {
      console.error('Supabase token validation error:', error);
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        details: error?.message 
      });
    }

    req.userId = user.id;
    req.userEmail = user.email;
    req.token = token;

    // 3. Create a scoped Supabase client for this request
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    req.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 2. Ensure user exists in database
    await ensureUserProfile(user.id, user.email, user.user_metadata?.full_name, token as string);

    next();
  } catch (error: any) {
    console.error('Supabase Auth middleware error:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      details: error.message
    });
  }
};
