import { Request, Response } from 'express';
import { supabase } from '../lib/supabase.ts';

export const getAllUsers = async (req: any, res: Response) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(users);
  } catch (error: any) {
    console.error('Admin: Get users error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAllFiles = async (req: any, res: Response) => {
  try {
    const { data: files, error } = await supabase
      .from('files')
      .select('*, owner:users(email, name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(files);
  } catch (error: any) {
    console.error('Admin: Get files error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAuditLogs = async (req: any, res: Response) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { data: logs, error, count } = await supabase
      .from('audit_logs')
      .select('*, user:users(email, name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;
    res.json({ logs, total: count });
  } catch (error: any) {
    console.error('Admin: Get logs error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateUserRole = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(user);
  } catch (error: any) {
    console.error('Admin: Update role error:', error);
    res.status(500).json({ error: error.message });
  }
};
