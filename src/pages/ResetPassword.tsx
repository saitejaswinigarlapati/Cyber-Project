import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase-client.ts';
import { motion } from 'motion/react';

import { Reveal } from '../components/animations/Reveal.tsx';
import { Magnetic } from '../components/animations/Magnetic.tsx';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character');
      return;
    }

    setLoading(true);

    try {
      // With Supabase, clicking the reset link from email authenticated the user temporarily
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) throw error;

      setSuccess('Password has been reset successfully!');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen -m-8 flex items-center justify-center relative overflow-hidden">
      <Reveal width="w-full" className="max-w-md relative z-10 px-4">
        <div className="bg-[#141416]/80 rounded-[2.5rem] shadow-2xl p-10 border border-white/5 backdrop-blur-xl">
          <div className="flex flex-col items-center mb-8">
            <motion.div 
              whileHover={{ rotate: -5, scale: 1.1, filter: "brightness(1.2)" }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
              className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-900/40 mb-6 rotate-3 font-black"
            >
              <ShieldCheck className="w-10 h-10" />
            </motion.div>
            <h1 className="text-3xl font-black text-white tracking-tight">Reset Password</h1>
          </div>

          {success ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-green-400 font-bold mb-4">{success}</p>
              <p className="text-gray-400 text-sm">Redirecting to login in 3 seconds...</p>
              <Link to="/login" className="mt-6 block text-blue-500 hover:white transition-all text-sm font-bold">
                Go to Login now
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl font-bold animate-shake"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">New Password</label>
                <motion.div 
                  whileFocus={{ scale: 1.01 }}
                  className="relative group"
                >
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-4 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                    placeholder="••••••••"
                    required
                  />
                </motion.div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">Confirm New Password</label>
                <motion.div 
                  whileFocus={{ scale: 1.01 }}
                  className="relative group"
                >
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-4 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                    placeholder="••••••••"
                    required
                  />
                </motion.div>
              </div>

              <Magnetic padding={0.2}>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group flex items-center justify-center gap-2 text-sm uppercase tracking-widest min-w-[340px]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset Password'}
                </button>
              </Magnetic>

              <div className="text-center pt-2">
                <Link to="/login" className="text-gray-500 hover:text-white transition-all text-sm font-bold">
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </Reveal>
    </div>
  );
};

export default ResetPassword;
