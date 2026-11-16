import { useState } from 'react';
import { Eye, EyeOff, Plus, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import type { Profile, Role } from '../types';
import { Avatar, Badge, Button, Empty, ErrorMessage, Field, FormFooter, Input, Modal, SectionTitle, Select } from './ui';

export function AccountsPanel({ notify }: { notify: (message: string) => void }) {
  const { profiles, profile, execute, demo, sync } = useStore();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleChange, setRoleChange] = useState<{ profile: Profile; role: Role } | null>(null);
  if (profile?.role !== 'admin') return null;

  const changeRole = async () => {
    if (!roleChange) return;
    setBusy(true); setError('');
    try {
      const result = await execute({ type: 'profile.role', payload: { id: roleChange.profile.id, role: roleChange.role } });
      notify(result === 'queued' ? 'Changement de rôle conservé en attente de confirmation.' : 'Droits mis à jour.');
      setRoleChange(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <>
    <section className="panel">
      <SectionTitle title="Comptes de l’établissement" description="Créez les identifiants de votre équipe et attribuez les droits de chaque personne."
        action={<Button icon={Plus} disabled={demo} onClick={() => setCreating(true)}>Créer un compte</Button>} />
      {demo ? <div className="panel-note"><Badge tone="orange">Démonstration locale</Badge><p>La création de vrais comptes est disponible sur le site connecté à Supabase.</p></div> : <>
        <div className="table-scroll secondary-section"><table><thead><tr><th>Utilisateur</th><th>Accès</th><th>Rôle</th></tr></thead><tbody>
          {profiles.map(p => <tr key={p.id}>
            <td><div className="person-cell"><Avatar name={p.name} size="sm" /><strong>{p.name}{p.id === profile.id ? ' (vous)' : ''}</strong></div></td>
            <td><Badge tone={p.role === 'pending' ? 'orange' : 'green'} dot>{p.role === 'pending' ? 'Sans accès' : 'Actif'}</Badge></td>
            <td><Select aria-label={`Rôle de ${p.name}`} value={p.role} disabled={p.id === profile.id || busy} onChange={e => { setError(''); setRoleChange({ profile: p, role: e.target.value as Role }); }}>
               <option value="pending">Sans accès / suspendu</option><option value="manager">Gérant</option><option value="admin">Administrateur</option>
            </Select></td>
          </tr>)}
        </tbody></table></div>
        {!profiles.length && <Empty title="Aucun autre compte" text="Créez le premier accès de votre équipe." />}
        <div className="table-footer"><span><ShieldCheck size={15} />Les droits sont vérifiés à chaque validation.</span><Button variant="ghost" onClick={() => void sync()}>Actualiser</Button></div>
      </>}
      <div className="table-scroll"><table><thead><tr><th>Action</th><th>Administrateur</th><th>Gérant</th></tr></thead><tbody>
        {[
          ['Fiches journalières', 'Oui', 'Oui'], ['Personnel, produits et stock', 'Oui', 'Oui'],
          ['Dettes et remboursements', 'Oui', 'Oui'], ['Modification du salaire', 'Oui', 'Non'],
          ['Salaires', 'Paiement', 'Lecture'], ['Annulation de fiche', 'Avec motif', 'Avec motif'],
          ['Créer les comptes et attribuer les rôles', 'Oui', 'Non'],
        ].map(row => <tr key={row[0]}>{row.map((value, i) => <td key={i}>{value}</td>)}</tr>)}
      </tbody></table></div>
    </section>
    {creating && <CreateAccount close={() => setCreating(false)} notify={notify} />}
    {roleChange && <Modal title="Modifier les droits" description={roleChange.profile.name} onClose={() => !busy && setRoleChange(null)}>
      <form onSubmit={e => { e.preventDefault(); void changeRole(); }}><div className="modal-body">
        <p>{roleChange.role === 'admin' ? 'Cette personne aura accès aux salaires, aux paramètres et à la création des comptes.' : roleChange.role === 'pending' ? 'Cette personne ne pourra plus consulter les données ni valider de nouvelles opérations après la vérification de son accès.' : 'Nouveau rôle : gérant, chargé de toute la gestion quotidienne.'}</p>
        <ErrorMessage error={error} />
      </div><FormFooter busy={busy} onClose={() => setRoleChange(null)} label="Confirmer les droits" /></form>
    </Modal>}
  </>;
}

function CreateAccount({ close, notify }: { close: () => void; notify: (message: string) => void }) {
  const { sync } = useStore();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('manager'); const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (!navigator.onLine) throw new Error('Connectez-vous à Internet pour créer un compte.');
      const { data: session, error: sessionError } = await supabase!.auth.getSession();
      if (sessionError || !session.session) throw new Error('Votre session a expiré. Reconnectez-vous.');
      const response = await fetch('/api/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ name, email, password, role }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.created) { setPassword(''); await sync(); }
        throw new Error(result.error || 'Création impossible. Réessayez.');
      }
      setPassword(''); await sync(); close();
      notify(`Compte de ${name.trim()} créé. La personne peut se connecter avec les identifiants définis.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible.'); }
    finally { setBusy(false); }
  };
  return <Modal title="Créer un compte" description="Définissez les identifiants de connexion de votre collaborateur." onClose={() => !busy && close()}>
    <form onSubmit={e => { e.preventDefault(); void submit(); }}><div className="modal-body">
      <Field label="Nom de l’utilisateur"><Input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={150} required autoComplete="off" placeholder="Ex. Robert Adé" /></Field>
      <Field label="Adresse e-mail de connexion"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required autoComplete="off" placeholder="gerant@votrebar.com" /></Field>
      <Field label="Mot de passe" hint="De 12 à 72 caractères. Communiquez les identifiants directement à cette personne."><Input type={visible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={72} required autoComplete="new-password" /></Field>
      <Button type="button" variant="ghost" icon={visible ? EyeOff : Eye} onClick={() => setVisible(v => !v)}>{visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}</Button>
      <Field label="Rôle"><Select value={role} onChange={e => setRole(e.target.value as Role)}><option value="manager">Gérant — gestion quotidienne</option><option value="admin">Administrateur — accès complet</option></Select></Field>
      {role === 'admin' && <div className="info-box"><ShieldCheck size={18} /><p>Ce compte pourra créer d’autres utilisateurs et gérer les salaires.</p></div>}
      <ErrorMessage error={error} />
    </div><FormFooter busy={busy} onClose={close} label="Créer le compte" /></form>
  </Modal>;
}
