import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase-client.ts';

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (userData: any) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Check active sessions and sets the user
    const initializeAuth = async () => {
      console.log('[Auth] Initializing auth state...');
      
      const safetyTimeout = setTimeout(() => {
        if (mounted && loading) {
          console.warn('[Auth] Initialization taking too long, forcing loading to false.');
          setLoading(false);
        }
      }, 8000);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[Auth] Session error during init:', sessionError);
          setError(sessionError.message);
        }

        if (session && mounted) {
          console.log('[Auth] Session found during init, setting user...');
          handleSessionSet(session);
        } else if (mounted) {
          console.log('[Auth] No session found during init.');
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[Auth] Critical initialization error:', err);
        setError(err.message || 'Unknown auth error');
        setLoading(false);
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    const handleSessionSet = async (session: any) => {
      if (!mounted) return;
      
      const isAdminEmail = session.user.email === 'admin@gmail.com' || session.user.email === 'garlapatitejaswini9@gmail.com';
      
      const userData: User = {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
        role: isAdminEmail ? 'admin' : 'user', 
      };

      setUser(userData);
      setToken(session.access_token);
      localStorage.setItem('token', session.access_token);

      try {
        console.log(`[Auth] Fetching profile for: ${session.user.email} (${session.user.id})`);
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('[Auth] Profile fetch error:', profileError);
        }

        if (profile && mounted) {
          console.log('[Auth] Profile loaded successfully. Role:', profile.role);
          // If it's a target admin email but DB says 'user', we might want to update DB or just keep local state as admin
          const finalRole = isAdminEmail ? 'admin' : profile.role;
          setUser(prev => prev ? { ...prev, role: finalRole } : null);
        } else if (!profile && mounted) {
          console.warn('[Auth] No profile found in users table. Attempting to create one...');
          const { data: newProfile, error: insertError } = await supabase
            .from('users')
            .insert({
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
              role: isAdminEmail ? 'admin' : 'user'
            })
            .select('role')
            .maybeSingle();
          
          if (insertError) {
            console.error('[Auth] Failed to create profile:', insertError);
          } else if (newProfile) {
            console.log(`[Auth] Profile created. Role: ${newProfile.role}`);
            setUser(prev => prev ? { ...prev, role: newProfile.role } : null);
          }
        }
      } catch (error) {
        console.error('[Auth] Unexpected error during profile sync:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth] Auth Event: ${event}`);
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || (event === 'INITIAL_SESSION' && session)) {
        if (session) {
          handleSessionSet(session);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] Signed out event, clearing state');
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = (userData: any) => {
    setUser(userData.user);
    setToken(userData.token);
    localStorage.setItem('token', userData.token);
  };

  const logout = async () => {
    try {
      console.log('[Auth] Logging out...');
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Supabase signOut error:', err);
    } finally {
      // Force clear everything regardless of whether signOut succeeded
      console.log('[Auth] Force clearing session state');
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      // We don't necessarily want to set loading to false here if we are navigating away,
      // but it helps if the app stays on the same page for a moment.
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!token || !user) return;
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        console.log('[Auth] Profile refreshed, role:', profile.role);
        setUser(prev => prev ? { ...prev, role: profile.role } : null);
      }
    } catch (error) {
      console.error('[Auth] Error refreshing profile:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
