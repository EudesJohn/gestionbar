import { useState } from 'react';
import { KeyRound, ShieldCheck, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { Button, ErrorMessage, Field, Input } from './ui';

export function MfaScreen() {
  const { mfa, signOut, finishMfa } = useStore();
  const [factorId, setFactorId] = useState(mfa?.factorId || '');
  const [qr, setQr] = useState(''); const [secret, setSecret] = useState('');
  const [code, setCode] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const enroll = async () => {
    setBusy(true); setError('');
    try {
      // Remove only unverified attempts owned by this session, never a verified factor.
      const { data: factors, error: listError } = await supabase!.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = factors.totp[0];
      if (verified) { setFactorId(verified.id); return; }
      for (const factor of factors.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        const { error: removeError } = await supabase!.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }
      const { data, error: enrollError } = await supabase!.auth.mfa.enroll({ factorType: 'totp', issuer: 'Comptoir', friendlyName: 'Application d’authentification' });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      // SVG stays in an image context, not injected as executable HTML.
      const svg = data.totp.qr_code;
      setQr(svg.startsWith('data:image/svg+xml;utf-8,') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.slice('data:image/svg+xml;utf-8,'.length))}` : svg);
      setSecret(data.totp.secret);
    } catch { setError('Impossible de préparer la double authentification. Réessayez.'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError('');
    try {
      const { error: verifyError } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) { setCode(''); throw verifyError; }
      setQr(''); setSecret(''); setCode(''); await finishMfa();
    } catch { setError('Code incorrect ou expiré. Utilisez le code actuel de votre application.'); }
    finally { setBusy(false); }
  };
  return <main className="security-screen"><section className="security-card">
    <span className="security-emblem"><ShieldCheck size={28} /></span>
    <h1>{mfa?.needsEnrollment && !factorId ? 'Protégez votre compte' : 'Vérification de sécurité'}</h1>
    <p>Un code à usage unique protège l’accès aux données du bar, en complément de votre mot de passe.</p>
    {!factorId ? <><p>Préparez une application d’authentification sur votre téléphone, par exemple Google Authenticator, Microsoft Authenticator ou Aegis.</p><Button disabled={busy} icon={KeyRound} onClick={() => void enroll()}>{busy ? 'Préparation…' : 'Configurer la double authentification'}</Button></> : <>
      {qr && <><img className="mfa-qr" src={qr} width={210} height={210} alt="QR code à scanner avec votre application d’authentification" /><p>Scannez le QR code, puis saisissez le code à 6 chiffres.</p><Button variant="ghost" type="button" onClick={() => setShowSecret(v => !v)}>{showSecret ? 'Masquer la clé' : 'Afficher la clé pour une saisie manuelle'}</Button>{showSecret && <code className="mfa-secret">{secret}</code>}</>}
      <form onSubmit={e => { e.preventDefault(); void verify(); }}>
        <Field label="Code de vérification"><Input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required placeholder="000000" /></Field>
        <Button type="submit" disabled={busy}>{busy ? 'Vérification…' : 'Vérifier le code'}</Button>
      </form>
    </>}
    <ErrorMessage error={error} />
    <p className="security-help">Conservez l’accès à votre application d’authentification. En cas de perte du téléphone, contactez le propriétaire du projet pour la récupération du compte.</p>
    <Button variant="ghost" icon={LogOut} disabled={busy} onClick={() => void signOut()}>Se déconnecter</Button>
  </section></main>;
}
