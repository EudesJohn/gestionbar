import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.VITE_SUPABASE_URL;
if (!serviceKey || !url) throw new Error('Configurez les variables serveur avant de lancer le script.');
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
await mkdir('.local', { recursive: true });
let accounts;
try { accounts = JSON.parse(await readFile('.local/test-accounts.json', 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  accounts = [
    { name: 'Administrateur Test', email: 'admin.test@comptoir.example', role: 'admin' },
    { name: 'Gérant Test', email: 'gerant.test@comptoir.example', role: 'manager' },
  ].map(account => ({ ...account, password: `Ct!${randomBytes(18).toString('base64url')}9a` }));
  await writeFile('.local/test-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 });
}

// Check for existing users before creation; never reset an unrelated account or create duplicates.
const existing = [];
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error('Lecture des comptes impossible : ' + error.message);
  existing.push(...data.users);
  if (data.users.length < 100) break;
}

for (const account of accounts) {
  let user = existing.find(user => user.email === account.email);
  if (user && user.user_metadata?.comptoir_test_account !== true) throw new Error('Un compte non créé par ce script utilise déjà ' + account.email);
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email: account.email, password: account.password, email_confirm: true,
      user_metadata: { name: account.name, comptoir_test_account: true },
    });
    if (error) throw new Error('Création impossible : ' + error.message);
    user = data.user;
  }
  const { data: updated, error } = await client.from('profiles').update({ name: account.name, role: account.role }).eq('id', user.id).select('id,role').single();
  if (error || !updated) throw new Error('Attribution du rôle impossible : ' + (error?.message || 'profil absent'));
  account.id = user.id;
  console.log(JSON.stringify({ email: account.email, role: updated.role, configured: true }));
}
await writeFile('.local/test-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 });
await writeFile('.local/ACCES_TEST.md', '# Comptes de test Comptoir\n\nSite : https://gestionbar-amber.vercel.app\n\n' + accounts.map(a => `## ${a.name}\n\n- Identifiant : \`${a.email}\`\n- Mot de passe : \`${a.password}\`\n- Rôle : ${a.role}\n`).join('\n'), { mode: 0o600 });
console.log('Les identifiants sont disponibles dans .local/ACCES_TEST.md (exclu de Git et des déploiements).');
