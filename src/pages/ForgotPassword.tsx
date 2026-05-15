import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Mail, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase-client.ts';
import { motion } from 'motion/react';
import { Reveal } from '../components/animations/Reveal.tsx';
import { Magnetic } from '../components/animations/Magnetic.tsx';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (resetError) throw resetError;
      
      setSuccess('If an account exists with that email, a reset link has been sent.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to process request');
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
            <h1 className="text-3xl font-black text-white tracking-tight">Forgot Password</h1>
            <p className="text-gray-400 mt-2 text-center text-balance font-medium">We'll send you a link to reset your password</p>
          </div>

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

            {success && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-2xl font-bold"
              >
                {success}
              </motion.div>
            )}

            {!success && (
              <>
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
                      className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.08] rounded-2xl py-4 pl-12 pr-4 outline-none transition-all placeholder:text-gray-600 text-white font-medium"
                      placeholder="name@example.com"
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
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        Send Reset Link
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </Magnetic>
              </>
            )}

            <div className="text-center pt-2">
              <Link to="/login" className="text-gray-500 hover:text-white transition-all text-sm font-bold">
                Back to Login
              </Link>
            </div>
          </form>
        </div>
      </Reveal>
    </div>
  );
};

export default ForgotPassword;
