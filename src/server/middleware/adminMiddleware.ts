import { Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.ts';

export const adminMiddleware = async (req: any, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check role in users table
    const { data: user, error } = await supabase
      .from('users')
      .select('email, role')
      .eq('id', req.userId)
      .maybeSingle();

    if (error || !user) {
      console.error('Admin middleware check error:', error);
      return res.status(403).json({ error: 'Access denied. User profile not found.' });
    }

    const isAdminEmail = user.email === 'admin@gmail.com' || user.email === 'garlapatitejaswini9@gmail.com';

    if (user.role !== 'admin' && !isAdminEmail) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    next();
  } catch (error) {
    console.error('Admin middleware unexpected error:', error);
    res.status(500).json({ error: 'Internal server error during authorization' });
  }
};
