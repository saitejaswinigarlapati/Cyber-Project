import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase-client.ts'; // We'll need a client-side supabase instance
import { motion } from 'motion/react';

import { Reveal } from '../components/animations/Reveal.tsx';
import { Magnetic } from '../components/animations/Magnetic.tsx';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
  const type = searchParams.get('type') || 'signup';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!tokenHash) {
        setStatus('error');
        setMessage('Verification token is missing.');
        return;
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as any,
        });

        if (error) throw error;

        setStatus('success');
        setMessage('Email verified successfully! You can now log in.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Failed to verify email.');
      }
    };

    verify();
  }, [tokenHash, type]);

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
            <h1 className="text-3xl font-black text-white tracking-tight">Email Verification</h1>
          </div>

          <div className="flex flex-col items-center text-center">
            {status === 'loading' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center"
              >
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-gray-400 font-medium">Verifying your email address...</p>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center w-full"
              >
                <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                <p className="text-green-400 font-bold mb-6">{message}</p>
                <Magnetic padding={0.2}>
                  <Link to="/login" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center uppercase tracking-widest text-sm min-w-[340px]">
                    Go to Login
                  </Link>
                </Magnetic>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col items-center w-full"
              >
                <XCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-red-400 font-bold mb-6">{message}</p>
                <Magnetic padding={0.1}>
                  <Link to="/signup" className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center uppercase tracking-widest text-sm mb-4 min-w-[340px]">
                    Back to Sign Up
                  </Link>
                </Magnetic>
                <Link to="/login" className="text-gray-500 hover:text-white transition-all text-sm font-bold pt-2">
                  Already verified? Login
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default VerifyEmail;
