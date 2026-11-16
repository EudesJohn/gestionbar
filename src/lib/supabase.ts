import { createClient } from '@supabase/supabase-js';
// Browser tests use isolated demo data even when this workstation is connected to Supabase.
const testing = import.meta.env.DEV && import.meta.env.MODE === 'e2e';
const url = testing ? '' : import.meta.env.VITE_SUPABASE_URL?.trim();
const key = testing ? '' : import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
