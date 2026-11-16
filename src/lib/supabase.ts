import { createClient } from '@supabase/supabase-js';
// Browser tests use isolated demo data even when this workstation is connected to Supabase.
const testing = import.meta.env.DEV && import.meta.env.MODE === 'e2e';
const url = testing ? '' : import.meta.env.VITE_SUPABASE_URL?.trim();
const key = testing ? '' : import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const supabase = url && key ? createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) }, auth: {
  persistSession: true,
  storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  autoRefreshToken: true,
  detectSessionInUrl: false,
} }) : null;
