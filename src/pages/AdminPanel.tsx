import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  FileText, 
  Activity, 
  Search, 
  Shield, 
  UserCog, 
  Clock, 
  Globe, 
  ChevronRight,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
  user?: {
    email: string;
    name: string;
  };
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  created_at: string;
  owner?: {
    email: string;
    name: string;
  };
}

export default function AdminPanel() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'files' | 'logs'>('logs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = activeTab === 'users' ? '/api/admin/users' : 
                       activeTab === 'files' ? '/api/admin/files' : 
                       '/api/admin/logs';
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch data');
      }
      
      const data = await response.json();
      
      if (activeTab === 'users') setUsers(data);
      else if (activeTab === 'files') setFiles(data);
      else setLogs(data.logs);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, token]);

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      
      if (!response.ok) throw new Error('Failed to update role');
      
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredData = () => {
    if (activeTab === 'users') {
      return users.filter(u => 
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (activeTab === 'files') {
      return files.filter(f => 
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.owner?.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return logs.filter(l => 
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.user?.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-500" />
            Admin Control Center
          </h1>
          <p className="text-gray-400">Audit monitoring and platform management</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-[#1a1a1c] border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchData}
            className="p-2 bg-[#1a1a1c] border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1a1c] p-1 rounded-xl border border-gray-800 w-fit">
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'logs' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-[#252529] hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          Audit Logs
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-[#252529] hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Users
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'files' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-[#252529] hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Files
        </button>
      </div>

      {/* Content */}
      <div className="bg-[#1a1a1c] rounded-2xl border border-gray-800 overflow-hidden">
        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-500 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          {activeTab === 'logs' && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium">Timestamp</th>
                  <th className="px-6 py-4 font-medium">User</th>
                  <th className="px-6 py-4 font-medium">Action</th>
                  <th className="px-6 py-4 font-medium">Entity</th>
                  <th className="px-6 py-4 font-medium">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredData().map((log: any) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-white text-sm">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs font-bold">
                          {log.user?.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white text-sm">{log.user?.name || 'Unknown'}</span>
                          <span className="text-gray-500 text-xs">{log.user?.email || 'N/A'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                        log.action === 'DELETE' ? 'bg-red-500/10 text-red-500' :
                        log.action === 'UPLOAD' ? 'bg-green-500/10 text-green-500' :
                        log.action === 'LOGIN' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-gray-500/10 text-gray-500'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-white text-sm">{log.entity_type}</span>
                        <span className="text-gray-500 text-xs truncate max-w-[200px]">
                          {log.details?.name || log.details?.fileName || 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Globe className="w-3 h-3" />
                        {log.ip_address || '---'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'users' && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium">User</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredData().map((user: any) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                          {user.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white font-medium">{user.name}</span>
                          <span className="text-gray-500 text-xs">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.role === 'admin' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleUpdateRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                        className="p-2 text-gray-500 hover:text-white transition-colors"
                        title={user.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                      >
                        <UserCog className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'files' && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium">File Name</th>
                  <th className="px-6 py-4 font-medium">Owner</th>
                  <th className="px-6 py-4 font-medium">Size</th>
                  <th className="px-6 py-4 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredData().map((file: any) => (
                  <tr key={file.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="text-white font-medium">{file.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-white text-sm">{file.owner?.name || 'Unknown'}</span>
                        <span className="text-gray-500 text-xs">{file.owner?.email || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {(file.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {new Date(file.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredData().length === 0 && !loading && (
          <div className="p-20 flex flex-col items-center justify-center text-gray-500">
            <Activity className="w-12 h-12 mb-4 opacity-20" />
            <p>No records found matching your query</p>
          </div>
        )}
      </div>
    </div>
  );
}
