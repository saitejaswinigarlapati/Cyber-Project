import { Response } from 'express';
import { supabase } from '../lib/supabase';

export const getNotifications = async (req: any, res: Response) => {
  try {
    const supabaseClient = req.supabase || supabase;
    const { data: notifications, error } = await supabaseClient
      .from('notifications')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[NOTIFICATIONS] Database Error:', error.message, error.details);
      // If table doesn't exist, return empty array instead of 500 to keep UI clean
      if (error.code === '42P01') {
        return res.json([]);
      }
      throw error;
    }
    res.json(notifications || []);
  } catch (error: any) {
    console.error('Get notifications error:', error);
    const errorMessage = error.message || error.details || 'Internal server error fetching notifications';
    res.status(500).json({ error: errorMessage });
  }
};

export const markAsRead = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const supabaseClient = req.supabase || supabase;
    
    if (id === 'all') {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', req.userId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', req.userId);
      if (error) throw error;
    }

    res.json({ message: 'Marked as read' });
  } catch (error: any) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteNotification = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const supabaseClient = req.supabase || supabase;

    const { error } = await supabaseClient
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) throw error;
    res.json({ message: 'Notification deleted' });
  } catch (error: any) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: error.message });
  }
};
