import { useEffect, useState } from 'react';
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { listQueue } from '../lib/private-storage';
import { Badge, Button, ErrorMessage, Field, Input, SectionTitle } from './ui';

export function AdminCredentials({ notify }: { notify: (message: string) => void }) {
  const { profile, demo, online, pending, signOut, sync } = useStore();
  const [name, setName] = useState(profile?.name || '');
  const [currentEmail, setCurrentEmail] = useState(''); const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState(''); const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'name' | 'email' | 'password' | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { setName(profile?.name || ''); }, [profile?.id, profile?.name]);
  useEffect(() => {
    if (!supabase || profile?.role !== 'admin') return;
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Impossible de vérifier les informations de votre compte.');
      else { setCurrentEmail(data.user.email || ''); setEmail(data.user.email || ''); }
    });
    return () => { active = false; };
  }, [profile?.id, profile?.role]);
  if (profile?.role !== 'admin') return null;

  const update = async (action: 'name' | 'email' | 'password') => {
    setBusy(action); setError(''); setMessage('');
    try {
      if (!online || demo || !supabase) throw new Error('Connectez-vous au site en ligne pour modifier votre compte.');
      if (action === 'password' && password !== confirmation) throw new Error('Les deux nouveaux mots de passe ne correspondent pas.');
      if (action === 'password' && (await listQueue(profile.id)).length) throw new Error('Synchronisez les fiches en attente avant de modifier votre mot de passe.');
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session.session) throw new Error('Reconnectez-vous pour modifier votre compte.');
      const response = await fetch('/api/admin-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify(action === 'name' ? { action, name } : action === 'email' ? { action, email, currentPassword: emailPassword } : { action, currentPassword, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'La modification a été refusée.');
      if (action === 'name') {
        setName(result.name);
        await sync();
        setMessage(result.message);
        return;
      }
      setEmailPassword(''); setCurrentPassword(''); setPassword(''); setConfirmation('');
      if (result.reauthenticate) { notify('Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.'); await signOut(); }
      else setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible.'); }
    finally { setBusy(null); }
  };
  return <>
    <div className="info-box"><ShieldCheck size={20} /><p>Ces réglages concernent votre compte administrateur et nécessitent une session avec double authentification. Votre mot de passe actuel est demandé pour modifier l’e-mail ou le mot de passe.</p></div>
    {demo && <div className="status-banner secondary-section"><Badge tone="orange">Démonstration</Badge>Le compte réel se modifie sur le site connecté.</div>}
    <ErrorMessage error={error} />
    {message && <div className="success-box" role="status">{message}</div>}
    <form className="panel settings-form secondary-section" onSubmit={e => { e.preventDefault(); void update('name'); }}>
      <SectionTitle title="Nom de l’administrateur" description="Le nom affiché dans votre espace et la liste des comptes." action={<UserRound size={19} />} />
      <div className="settings-fields">
        <Field label="Nom affiché"><Input type="text" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={150} autoComplete="name" required disabled={!!busy || demo} /></Field>
      </div>
      <div className="form-footer"><Button type="submit" disabled={!!busy || demo || !online || name.trim().replace(/\s+/gu, ' ') === profile.name || Array.from(name.trim()).length < 2}>{busy === 'name' ? 'Enregistrement…' : 'Enregistrer mon nom'}</Button></div>
    </form>
    <div className="settings-grid secondary-section">
      <form className="panel settings-form" onSubmit={e => { e.preventDefault(); void update('email'); }}>
        <SectionTitle title="Adresse e-mail de connexion" description={currentEmail ? `Adresse actuelle : ${currentEmail}` : 'Votre identifiant de connexion.'} action={<Mail size={19} />} />
        <div className="settings-fields">
          <Field label="Nouvelle adresse e-mail"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" required disabled={!!busy || demo} /></Field>
          <Field label="Mot de passe actuel pour l’e-mail"><Input type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} autoComplete="current-password" required disabled={!!busy || demo} /></Field>
          <p className="form-note">La nouvelle adresse sera active après validation des liens de confirmation envoyés par Supabase.</p>
        </div><div className="form-footer"><Button type="submit" disabled={!!busy || demo || !online || !email || email.trim().toLowerCase() === currentEmail.toLowerCase()}>{busy === 'email' ? 'Enregistrement…' : 'Modifier mon e-mail'}</Button></div>
      </form>
      <form className="panel settings-form" onSubmit={e => { e.preventDefault(); void update('password'); }}>
        <SectionTitle title="Mot de passe" description="Un mot de passe personnel que vous seul connaissez." action={<KeyRound size={19} />} />
        <div className="settings-fields">
          <Field label="Mot de passe actuel"><Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" required disabled={!!busy || demo} /></Field>
          <Field label="Nouveau mot de passe" hint="Au moins 15 caractères. Une phrase longue est plus facile à retenir."><Input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={15} maxLength={72} autoComplete="new-password" required disabled={!!busy || demo} /></Field>
          <Field label="Confirmer le nouveau mot de passe"><Input type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={15} maxLength={72} autoComplete="new-password" required disabled={!!busy || demo} /></Field>
          <p className="form-note">Synchronisez les fiches en attente sur vos appareils avant ce changement. Les sessions existantes seront fermées ; vous devrez vous reconnecter.</p>
          {!!pending.length && <p className="form-note">{pending.length} fiche(s) attendent encore une synchronisation sur cet appareil.</p>}
        </div><div className="form-footer"><Button type="submit" disabled={!!busy || demo || !online || pending.length > 0}>{busy === 'password' ? 'Enregistrement…' : 'Modifier mon mot de passe'}</Button></div>
      </form>
    </div>
  </>;
}
