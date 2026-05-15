import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase-client.ts';
import { motion } from 'motion/react';
import { Reveal } from '../components/animations/Reveal.tsx';
import { Magnetic } from '../components/animations/Magnetic.tsx';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Basic password validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (authError) throw authError;

      if (data.user && data.session) {
        setSuccess('Account created successfully!');
        setTimeout(() => navigate('/'), 1500);
      } else {
        setSuccess('Account created! Please check your email for a verification link.');
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'Failed to sign up. Please try again.');
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
              className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-900/40 mb-6 rotate-3"
            >
              <ShieldCheck className="w-10 h-10" />
            </motion.div>
            <h1 className="text-3xl font-black text-white tracking-tight text-center">Create account</h1>
            <p className="text-gray-400 mt-2 text-center text-balance font-medium">Join 2M+ users who trust our secure storage</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl font-bold animate-shake"
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-2xl font-bold"
              >
                {success}
                <div className="mt-4">
                  <Link to="/login" className="text-white bg-green-600/20 hover:bg-green-600/30 px-4 py-2 rounded-xl text-xs inline-block transition-all">
                    Go to Login
                  </Link>
                </div>
              </motion.div>
            )}

            {!success && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">Full Name</label>
                  <motion.div 
                    whileFocus={{ scale: 1.01 }}
                    className="relative group"
                  >
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                      placeholder="John Doe"
                      required
                    />
                  </motion.div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">Email Address</label>
                  <motion.div 
                    whileFocus={{ scale: 1.01 }}
                    className="relative group"
                  >
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                      placeholder="name@example.com"
                      required
                    />
                  </motion.div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">Password</label>
                  <motion.div 
                    whileFocus={{ scale: 1.01 }}
                    className="relative group"
                  >
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                      placeholder="••••••••"
                      required
                    />
                  </motion.div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 ml-1">Confirm Password</label>
                  <motion.div 
                    whileFocus={{ scale: 1.01 }}
                    className="relative group"
                  >
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-all" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                      placeholder="••••••••"
                      required
                    />
                  </motion.div>
                </div>

                <div className="pt-2">
                  <Magnetic padding={0.2}>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group flex items-center justify-center gap-2 text-sm uppercase tracking-widest min-w-[340px]"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <>
                          Sign Up
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </Magnetic>
                </div>
              </>
            )}
          </form>

          <p className="mt-8 text-center text-sm text-gray-500 font-bold tracking-tight">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-500 font-black hover:text-blue-400 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </Reveal>
    </div>
  );
};

export default Signup;
