/**
 * Auth context: Supabase session + tenant from backend /api/me.
 * Tenant is NEVER taken from client storage alone; we refresh from API when session exists.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (token) => {
    if (!token) {
      setUser(null);
      setTenant(null);
      return;
    }
    try {
      const data = await api.get(token, '/api/me');
      setUser(data.user || null);
      setTenant(data.tenant || null);
    } catch (e) {
      setUser(null);
      setTenant(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.access_token) {
        fetchMe(s.access_token);
      } else {
        setUser(null);
        setTenant(null);
      }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.access_token) {
        fetchMe(s.access_token);
      } else {
        setUser(null);
        setTenant(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchMe]);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signupComplete = useCallback(async (shopName) => {
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');
    const data = await api.post(token, '/api/signup/complete', { shopName, email: session.user?.email });
    await fetchMe(token);
    return data;
  }, [session, fetchMe]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTenant(null);
  }, []);

  const value = {
    session,
    user,
    tenant,
    loading,
    login,
    signUp,
    signupComplete,
    logout,
    token: session?.access_token || null,
    refetchMe: () => session?.access_token && fetchMe(session.access_token),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
