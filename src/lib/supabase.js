/**
 * Supabase client for Auth only. Tenant data is never accessed from frontend.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;

export function hasSupabaseConfig() {
  return Boolean(url && anonKey);
}
