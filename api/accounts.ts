import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

type Request = IncomingMessage & { body?: unknown };
const roles = new Set(['admin', 'manager']);

async function readBody(req: Request): Promise<unknown> {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 8192) throw new Error('Body too large');
  }
  return JSON.parse(raw);
}

// This function runs on Vercel, never in the browser bundle.
// Passwords go directly to Supabase Auth; neither audit entries nor the offline queue contain them.
export default async function handler(req: Request, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status: number, body: object) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { error: 'Méthode non autorisée.' }); }
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) return reply(401, { error: 'Connectez-vous pour créer un compte.' });
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Format JSON requis.' });
  if (Number(req.headers['content-length']) > 8192) return reply(413, { error: 'Requête trop volumineuse.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply(503, { error: 'La création des comptes n’est pas encore configurée sur le serveur.' });

  try {
    const userClient = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return reply(401, { error: 'Votre session a expiré. Reconnectez-vous.' });

    const serverClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: profile, error: profileError } = await serverClient.from('profiles').select('role').eq('id', auth.user.id).single();
    if (profileError || profile?.role !== 'admin') return reply(403, { error: 'Seul un administrateur peut créer des comptes.' });

    let body: unknown;
    try { body = await readBody(req); } catch { return reply(400, { error: 'La demande est invalide.' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'La demande est invalide.' });
    const { name, email, password, role } = body as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 150) return reply(422, { error: 'Indiquez un nom de 2 à 150 caractères.' });
    if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return reply(422, { error: 'Indiquez une adresse e-mail valide.' });
    if (typeof password !== 'string' || password.length < 12 || password.length > 72) return reply(422, { error: 'Le mot de passe doit contenir entre 12 et 72 caractères.' });
    if (typeof role !== 'string' || !roles.has(role)) return reply(422, { error: 'Choisissez un rôle valide.' });

    const normalizedEmail = email.trim().toLowerCase();
    const { data: created, error: createError } = await serverClient.auth.admin.createUser({
      email: normalizedEmail, password, email_confirm: true, user_metadata: { name: name.trim() },
    });
    if (createError || !created.user) {
      if (createError?.code === 'email_exists' || createError?.code === 'user_already_exists') return reply(409, { error: 'Cette adresse est déjà utilisée. Consultez les comptes existants.' });
      if (createError?.code === 'weak_password') return reply(422, { error: 'Choisissez un mot de passe plus fort.' });
      if (createError?.status === 429) return reply(429, { error: 'Trop de demandes. Réessayez dans quelques instants.' });
      return reply(502, { error: 'La création du compte a échoué. Réessayez dans quelques instants.' });
    }

    // Assignment uses the administrator's own JWT. PostgreSQL rechecks their current
    // role, records the author in the audit and publishes the Realtime invalidation.
    const { error: roleError } = await userClient.rpc('apply_command', {
      p_id: crypto.randomUUID(),
      p_command: { type: 'profile.role', payload: { id: created.user.id, role } },
    });
    if (roleError) return reply(409, {
      created: true, id: created.user.id,
      error: 'Le compte a été créé sans accès actif. Attribuez son rôle dans la liste des comptes.',
    });
    return reply(201, { id: created.user.id, name: name.trim(), email: normalizedEmail, role });
  } catch {
    return reply(502, { error: 'Le service de comptes est momentanément indisponible. Vérifiez la liste avant de réessayer.' });
  }
}
