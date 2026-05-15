import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Search, Settings, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NotificationCenter from './NotificationCenter.tsx';

const Navbar: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        navigate(`/?q=${encodeURIComponent(searchQuery)}`);
      } else if (searchParams.get('q')) {
        navigate('/');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, navigate, searchParams]);

  return (
    <header className="h-16 bg-[#0a0a0b]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 shrink-0 relative z-30">
      <div className="flex-1 max-w-2xl">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 hover:bg-white/[0.08] focus:bg-white/[0.08] border-transparent focus:border-white/10 rounded-xl py-2 pl-10 pr-4 outline-none transition-all placeholder:text-gray-500 text-white text-sm font-medium"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 ml-8">
        <NotificationCenter />
        <button className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-400 hover:text-white">
          <Settings className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 pl-4 border-l border-white/5">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-white uppercase tracking-wider">{user?.name}</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{user?.email}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-black uppercase shadow-lg shadow-blue-900/20">
            {user?.name.charAt(0)}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
