import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

type Request = IncomingMessage & { body?: unknown };
export default async function handler(req: Request, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status: number, value: object) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { error: 'Méthode non autorisée.' }); }
  const origins = new Set(['https://gestionbar-amber.vercel.app']);
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV !== 'production') { origins.add('http://localhost:3000'); origins.add('http://localhost:5173'); }
  if (!req.headers.origin || !origins.has(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Origine de la demande non autorisée.' });
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) return reply(401, { error: 'Connexion requise.' });
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Format JSON requis.' });
  if (Number(req.headers['content-length']) > 4096) return reply(413, { error: 'Requête trop volumineuse.' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply(503, { error: 'Le service de compte n’est pas configuré.' });
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  try {
    const userClient = createClient(url, publicKey, { ...options, global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !auth.user?.email) return reply(401, { error: 'Votre session a expiré. Reconnectez-vous.' });
    const server = createClient(url, serviceKey, options);
    const { data: profile, error: profileError } = await server.from('profiles').select('role').eq('id', auth.user.id).single();
    if (profileError || profile?.role !== 'admin') return reply(403, { error: 'Ces paramètres sont réservés à l’administrateur.' });
    let parsed: unknown;
    try {
      let raw = '';
      if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      else for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 4096) throw new Error(); }
      if (Buffer.byteLength(raw) > 4096) throw new Error();
      parsed = JSON.parse(raw);
    } catch { return reply(400, { error: 'La demande est invalide.' }); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(400, { error: 'La demande est invalide.' });
    const body = parsed as Record<string, unknown>;
    const allowedFields = body.action === 'name' ? ['action', 'name'] : ['action', 'currentPassword', 'email', 'password'];
    if (Object.keys(body).some(key => !allowedFields.includes(key))) return reply(422, { error: 'La demande contient des champs non autorisés.' });
    if (body.action === 'name') {
      if (typeof body.name !== 'string' || /[\u0000-\u001f\u007f]/u.test(body.name)) return reply(422, { error: 'Indiquez un nom de 2 à 150 caractères, sur une seule ligne.' });
      const name = body.name.trim().replace(/\s+/gu, ' ');
      if (Array.from(name).length < 2 || Array.from(name).length > 150) return reply(422, { error: 'Indiquez un nom de 2 à 150 caractères.' });
      const { error: securityError } = await userClient.rpc('touch_secure_session');
      if (securityError) return reply(403, { error: 'Une session active avec double authentification est nécessaire.' });
      // The display name lives in profiles, the source read by get_snapshot.
      // Keep the target fixed to the authenticated admin and recheck the role in the UPDATE.
      // The existing database trigger records the old and new profile values.
      const { data: updated, error: updateError } = await server.from('profiles')
        .update({ name }).eq('id', auth.user.id).eq('role', 'admin').select('id,name').single();
      if (updateError || !updated) return reply(409, { error: 'Le nom n’a pas pu être enregistré. Actualisez votre compte avant de réessayer.' });
      return reply(200, { id: updated.id, name: updated.name, message: 'Votre nom a été mis à jour.' });
    }
    if (body.action !== 'email' && body.action !== 'password') return reply(422, { error: 'Choisissez une modification valide.' });
    if (typeof body.currentPassword !== 'string' || !body.currentPassword || Buffer.byteLength(body.currentPassword) > 256) return reply(422, { error: 'Indiquez votre mot de passe actuel.' });
    if (body.action === 'email' && (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))) return reply(422, { error: 'Adresse e-mail invalide.' });
    if (body.action === 'password' && (typeof body.password !== 'string' || body.password.length < 15 || Buffer.byteLength(body.password, 'utf8') > 72)) return reply(422, { error: 'Le nouveau mot de passe doit contenir au moins 15 caractères, dans la limite de 72 octets.' });

    const { data: permitted, error: securityError } = await userClient.rpc('authorize_admin_credentials_change', { p_kind: body.action });
    if (securityError) return reply(403, { error: 'Une session active avec double authentification est nécessaire.' });
    if (permitted !== true) { res.setHeader('Retry-After', '900'); return reply(429, { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }); }

    // Reauthenticate in a separate short-lived session; never replace the caller's MFA session.
    const verifier = createClient(url, publicKey, options);
    const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({ email: auth.user.email, password: body.currentPassword });
    if (verifyError || verified.user?.id !== auth.user.id) return reply(403, { error: 'Le mot de passe actuel est incorrect.' });
    try {
      const change = body.action === 'email' ? { email: (body.email as string).trim().toLowerCase() } : { password: body.password as string };
      const response = await fetch(`${url}/auth/v1/user`, {
        method: 'PUT', headers: { apikey: publicKey, Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(change), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 429) return reply(429, { error: 'Patientez quelques minutes avant une nouvelle modification.' });
        return reply(422, { error: body.action === 'email' ? 'Le changement d’adresse n’a pas été accepté. Vérifiez l’adresse et réessayez.' : 'Le changement de mot de passe n’a pas été accepté. Reconnectez-vous et utilisez un mot de passe plus fort.' });
      }
      // No password or e-mail is written to the audit. Auth's own verification flow is preserved.
      if (body.action === 'email') return reply(200, { confirmationRequired: true, message: 'Confirmez la nouvelle adresse avec les liens envoyés par Supabase. Votre adresse actuelle reste utilisée jusqu’à confirmation.' });
      return reply(200, { reauthenticate: true, message: 'Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.' });
    } finally { await verifier.auth.signOut({ scope: 'local' }); }
  } catch { return reply(502, { error: 'Le service de compte est momentanément indisponible. Vérifiez votre connexion avant de réessayer.' }); }
}
