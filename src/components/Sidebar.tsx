import React from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { 
  LayoutDashboard, 
  Upload, 
  Users,
  Folder, 
  Clock, 
  Star, 
  Trash2, 
  LogOut,
  ShieldCheck,
  FilePlus,
  FolderUp,
  FileUp,
  Plus,
  ChevronRight,
  MoreVertical,
  Settings,
  HelpCircle,
  FolderPlus
} from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { motion, AnimatePresence } from 'motion/react';
import { useModals } from '../context/ModalContext.tsx';

const Sidebar: React.FC = () => {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { openModal, setUploadFolderMode } = useModals();
  const [showDropdown, setShowDropdown] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // If user is just a standard user, try once to see if their role changed (e.g. from SQL editor)
    if (user && user.role === 'user') {
      refreshProfile();
    }
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Shared Files', icon: Folder, path: '/shared' },
    { name: 'Recent', icon: Clock, path: '/recent' },
    { name: 'Starred', icon: Star, path: '/starred' },
    { name: 'Folders', icon: Folder, path: '/folders' },
    { name: 'Spam', icon: ShieldCheck, path: '/spam' },
    { name: 'Trash', icon: Trash2, path: '/trash' },
  ];

  if (user?.role === 'admin') {
    navItems.push({ name: 'Admin Panel', icon: ShieldCheck, path: '/admin' });
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout navigation error:', error);
      navigate('/login'); // Force navigation even if it fails
    }
  };

  return (
    <aside className="w-64 bg-[#0a0a0b] border-r border-white/5 flex flex-col h-full shrink-0">
      <div className="p-6">
        <div className="flex items-center gap-3 text-blue-500 mb-8">
          <div className="p-2 bg-blue-500/10 rounded-lg shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="font-black text-lg tracking-tight text-white uppercase italic">Locker</span>
        </div>

        <div className="relative mb-8" ref={dropdownRef}>
          <motion.button 
            onClick={() => setShowDropdown(!showDropdown)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "flex items-center gap-3 bg-blue-600 text-white px-4 py-3 rounded-2xl border border-blue-500 transition-all w-full group overflow-hidden relative",
              showDropdown ? "shadow-[0_0_20px_rgba(37,99,235,0.4)] ring-4 ring-blue-500/10" : "shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40"
            )}
          >
            <Plus className={cn("w-5 h-5 text-white transition-transform duration-300", showDropdown && "rotate-45")} />
            <span className="font-black text-xs uppercase tracking-widest">Create New</span>
          </motion.button>

          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 5, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full left-0 w-full bg-[#1c1c1e] border border-white/5 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden"
              >
                <button 
                  onClick={() => { openModal('folder'); setShowDropdown(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <FolderPlus className="w-4 h-4 text-blue-500" />
                  Folder
                </button>
                <button 
                  onClick={() => { setUploadFolderMode(true); openModal('upload'); setShowDropdown(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5"
                >
                  <FolderUp className="w-4 h-4 text-blue-500" />
                  Bulk Upload
                </button>
                <button 
                  onClick={() => { openModal('createFile'); setShowDropdown(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <FilePlus className="w-4 h-4 text-indigo-400" />
                  Text File
                </button>
                <button 
                  onClick={() => { setUploadFolderMode(false); openModal('upload'); setShowDropdown(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <FileUp className="w-4 h-4 text-indigo-400" />
                  Upload
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
                  isActive
                    ? 'bg-blue-600/10 text-blue-500 shadow-sm'
                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6">
        <button
          onClick={handleLogout}
          className="flex items-center gap-4 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 rounded-xl w-full transition-all"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
