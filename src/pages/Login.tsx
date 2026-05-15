import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, Loader2, ArrowRight, Timer } from 'lucide-react';
import { supabase } from '../lib/supabase-client.ts';
import { motion } from 'motion/react';
import { Reveal } from '../components/animations/Reveal.tsx';
import { Magnetic } from '../components/animations/Magnetic.tsx';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const navigate = useNavigate();

  // Helper to get/set lockout data from localStorage
  const getLockoutData = () => {
    const data = localStorage.getItem('login_lockouts');
    return data ? JSON.parse(data) : {};
  };

  const setLockoutData = (emailKey: string, attempts: number, lockUntilTime: number | null) => {
    const data = getLockoutData();
    data[emailKey] = { attempts, lockUntil: lockUntilTime };
    localStorage.setItem('login_lockouts', JSON.stringify(data));
  };

  // Sync state with current email input
  useEffect(() => {
    if (!email) {
      setLockUntil(null);
      setFailedAttempts(0);
      setTimeLeft(0);
      return;
    }

    const data = getLockoutData();
    const userLockout = data[email];

    if (userLockout) {
      if (userLockout.lockUntil && userLockout.lockUntil > Date.now()) {
        setLockUntil(userLockout.lockUntil);
        setFailedAttempts(userLockout.attempts);
        setTimeLeft(Math.ceil((userLockout.lockUntil - Date.now()) / 1000));
      } else {
        setLockUntil(null);
        setFailedAttempts(userLockout.attempts);
        setTimeLeft(0);
      }
    } else {
      setLockUntil(null);
      setFailedAttempts(0);
      setTimeLeft(0);
    }
  }, [email]);

  // Lockout timer
  useEffect(() => {
    let timer: any;
    if (lockUntil && lockUntil > Date.now()) {
      timer = setInterval(() => {
        const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockUntil(null);
          setTimeLeft(0);
          // Don't reset attempts here, just the lock
          setLockoutData(email, failedAttempts, null);
          clearInterval(timer);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockUntil, email, failedAttempts]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Double check specific email lock
    const data = getLockoutData();
    const userLockout = data[email];
    if (userLockout?.lockUntil && userLockout.lockUntil > Date.now()) {
      setError(`This account is locked. Please wait ${formatTime(timeLeft)}.`);
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const currentAttempts = (userLockout?.attempts || 0) + 1;
        setFailedAttempts(currentAttempts);
        
        if (currentAttempts >= 5) {
          const lockTime = Date.now() + 10 * 60 * 1000; // 10 minutes
          setLockUntil(lockTime);
          setLockoutData(email, currentAttempts, lockTime);
          setError(`5 failed attempts for this email. Locked for 10 minutes.`);
        } else {
          setLockoutData(email, currentAttempts, null);
          throw authError;
        }
      } else {
        // Success
        setLockoutData(email, 0, null);
        navigate('/');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message?.includes('Invalid login credentials')) {
        const dataNow = getLockoutData();
        const currentAttempts = dataNow[email]?.attempts || 0;
        const remaining = 5 - currentAttempts;
        setError(`Invalid credentials. ${remaining} attempts remaining for this email.`);
      } else {
        setError(err.message || 'Failed to login');
      }
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockUntil && lockUntil > Date.now();

  return (
    <div className="min-h-screen -m-8 flex items-center justify-center relative overflow-hidden">
      <Reveal width="w-full" className="max-w-md relative z-10 px-4">
        <div className="bg-[#141416]/80 rounded-[2.5rem] shadow-2xl p-10 border border-white/5 backdrop-blur-xl">
          <div className="flex flex-col items-center mb-8">
            <motion.div 
              whileHover={{ rotate: -5, scale: 1.1, filter: "brightness(1.2)" }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
              className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-900/40 mb-6 rotate-3"
            >
              <ShieldCheck className="w-10 h-10" />
            </motion.div>
            <h1 className="text-3xl font-black text-white tracking-tight">Login</h1>
            <p className="text-gray-400 mt-2 text-center text-balance font-medium">Access your secure files and folders</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-4 border text-sm rounded-2xl font-bold flex items-start gap-3 ${
                  isLocked 
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400" 
                    : "bg-red-500/10 border-red-500/20 text-red-400 animate-shake"
                }`}
              >
                {isLocked && <Timer className="w-5 h-5 shrink-0" />}
                <div className="flex-1">
                  {error}
                  {isLocked && <div className="mt-1 text-xs opacity-70">Remaining: {formatTime(timeLeft)}</div>}
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">Email Address</label>
              <motion.div 
                whileFocus={{ scale: 1.01 }}
                className="relative group"
              >
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all cursor-text" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-4 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                  placeholder="name@example.com"
                  required
                />
              </motion.div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between ml-1">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">Password</label>
                <Link to="/forgot-password" size="sm" className="text-xs font-black text-blue-500 hover:text-blue-400 transition-colors uppercase tracking-widest">Forgot?</Link>
              </div>
              <motion.div 
                whileFocus={{ scale: 1.01 }}
                className="relative group"
              >
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all cursor-text" />
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

            <Magnetic padding={0.2}>
              <button
                type="submit"
                disabled={loading || !!isLocked}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group flex items-center justify-center gap-2 text-sm uppercase tracking-widest min-w-[340px]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLocked ? (
                  <>Locked ({formatTime(timeLeft)})</>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </Magnetic>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500 font-bold tracking-tight">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-500 font-black hover:text-blue-400 transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </Reveal>
    </div>
  );
};

export default Login;
