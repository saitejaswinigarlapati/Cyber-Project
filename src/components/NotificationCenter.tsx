import React, { useState, useEffect } from 'react';
import { Bell, BellOff, X, Check, Trash2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../services/api.ts';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn, formatDate } from '../lib/utils.ts';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string;
  created_at: string;
}

const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch (error: any) {
      // Fail silently for polling to avoid annoying the user with constant popups
      // Only log if it's not a 42P01 (table missing) or 500 error we expect
      if (error.response?.status !== 500) {
        console.error('Failed to fetch notifications:', error);
      }
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/all/read');
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(notifications.filter(n => n.id !== id));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full border-2 border-[#0a0a0b]" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 bg-[#1c1c1e] border border-white/5 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-widest italic">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-gray-500 hover:text-indigo-400 transition-colors font-bold uppercase tracking-widest"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-600">
                    <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No notifications</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        "p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors group relative",
                        !n.is_read && "bg-indigo-500/5"
                      )}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-black text-white uppercase tracking-wider">{n.title}</span>
                        <span className="text-[8px] text-gray-600 font-bold uppercase tracking-tight">{formatDate(n.created_at)}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium leading-relaxed mb-2">{n.message}</p>
                      
                      <div className="flex items-center gap-2">
                        {!n.is_read && (
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                        )}
                        {n.link && (
                          <ExternalLink className="w-2.5 h-2.5 text-gray-600" />
                        )}
                      </div>

                      <button
                        onClick={(e) => deleteNotification(n.id, e)}
                        className="absolute right-2 bottom-2 p-1.5 text-gray-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
