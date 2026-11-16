import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './lib/supabase';
import { createDemoData, emptyData } from './lib/seed';
import { allowed, applyCommand } from './lib/domain';
import { uid } from './lib/format';
import { IDLE_TIMEOUT_MS, safeError, sessionDeadline } from './lib/security';
import { addQueue, clearSnapshot, deleteQueue, isVaultUnlocked, listQueue, lockVault, readSnapshot, saveSnapshot, unlockVault, updateQueue } from './lib/private-storage';
import type { Snapshot } from './lib/private-storage';
import type { Command, Data, Profile, QueuedCommand } from './types';

const demoProfile: Profile = { id: 'demo-admin', name: 'Eudes Johnson', role: 'admin' };
export interface MfaState { factorId?: string; needsEnrollment: boolean }
interface Store {
  data: Data; profile: Profile | null; profiles: Profile[]; loading: boolean; busy: boolean;
  online: boolean; demo: boolean; pending: QueuedCommand[]; error: string; mfa: MfaState | null;
  execute: (c: Command) => Promise<'saved' | 'queued'>; sync: () => Promise<void>; discard: (id: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>; finishMfa: () => Promise<void>;
}
const Context = createContext<Store | null>(null);
const activityKey = (id: string) => `comptoir-activity-${id}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(emptyData);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<QueuedCommand[]>([]);
  const [error, setError] = useState('');
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const stateRef = useRef({ data, profile }); stateRef.current = { data, profile };
  const lock = useRef(false); const owner = useRef(''); const generation = useRef(0);
  const signingIn = useRef(false); const signingOut = useRef(false); const expiresAt = useRef(0);

  const clearView = useCallback(() => {
    const cleared = emptyData(); stateRef.current = { data: cleared, profile: null };
    setData(cleared); setProfile(null); setProfiles([]); setPending([]);
  }, []);
  const refreshQueue = useCallback(async () => {
    const who = owner.current; const list = await listQueue(who);
    if (owner.current === who) setPending(list);
    return list;
  }, []);
  const signOut = useCallback(async () => {
    if (!supabase || signingOut.current) return;
    signingOut.current = true;
    const who = owner.current;
    owner.current = ''; generation.current++; clearView(); setMfa(null); setError(''); setLoading(true);
    // Hide data and erase the local key before any network request.
    try {
      if (who) { sessionStorage.removeItem(activityKey(who)); await lockVault(who); }
      if (navigator.onLine) {
        const { error: revokeError } = await supabase.rpc('revoke_current_session');
        if (revokeError) setError('La session locale est fermée. La révocation à distance n’a pas pu être confirmée.');
      }
    }
    finally {
      try { await supabase.auth.signOut({ scope: 'local' }); }
      finally {
        const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
        sessionStorage.removeItem(`sb-${project}-auth-token`);
        signingOut.current = false; setLoading(false);
      }
    }
  }, [clearView]);
  const fetchRemote = useCallback(async () => {
    if (!supabase || !owner.current) return;
    const who = owner.current; const token = generation.current;
    const { data: result, error: rpcError, status } = await supabase.rpc('get_snapshot');
    if (owner.current !== who || token !== generation.current) return;
    if (rpcError) {
      if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || rpcError.code === 'P0001') {
        clearView(); await clearSnapshot(who);
      }
      throw new Error(safeError(rpcError.message));
    }
    const snapshot = result as Snapshot;
    if (!['admin', 'manager'].includes(snapshot.profile.role) || snapshot.data.securityVersion !== 1) {
      clearView(); await clearSnapshot(who);
      throw new Error('La mise à jour de sécurité de la base est nécessaire avant de continuer.');
    }
    await saveSnapshot(who, snapshot);
    if (owner.current !== who || token !== generation.current) { await clearSnapshot(who); return; }
    setData(snapshot.data); setProfile(snapshot.profile); setProfiles(snapshot.profiles);
    stateRef.current = { data: snapshot.data, profile: snapshot.profile };
  }, [clearView]);

  const loadSession = useCallback(async (userId?: string) => {
    const token = ++generation.current; setLoading(true); setError('');
    const previousOwner = owner.current;
    owner.current = userId || (supabase ? '' : 'demo'); clearView(); setMfa(null);
    try {
      if (!supabase) {
        const cached = await readSnapshot('demo'); const next = cached?.data || createDemoData();
        if (token !== generation.current) return;
        setData(next); setProfile(demoProfile); stateRef.current = { data: next, profile: demoProfile };
        await saveSnapshot('demo', { data: next, profile: demoProfile, profiles: [] }); return;
      }
      if (!userId) { if (previousOwner) await lockVault(previousOwner); return; }
      if (previousOwner && previousOwner !== userId) await lockVault(previousOwner);
      if (!isVaultUnlocked(userId)) { setError('Reconnectez-vous pour déverrouiller les données de cet appareil.'); return; }
      const { data: current, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !current.session) throw new Error('Reconnectez-vous pour continuer.');
      expiresAt.current = sessionDeadline(current.session.access_token);
      const lastActivity = Number(sessionStorage.getItem(activityKey(userId)) || 0);
      if (expiresAt.current <= Date.now() || Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        await signOut(); setError('Votre session a expiré. Reconnectez-vous.'); return;
      }
      if (!navigator.onLine) {
        const cached = await readSnapshot(userId);
        if (!cached || cached.data.securityVersion !== 1) throw new Error('Une connexion Internet est nécessaire pour vérifier votre accès.');
        if (token !== generation.current) return;
        setData(cached.data); setProfile(cached.profile); setProfiles(cached.profiles);
        stateRef.current = { data: cached.data, profile: cached.profile }; await refreshQueue(); return;
      }
      const { data: security, error: statusError } = await supabase.rpc('get_security_status');
      if (statusError || security?.securityVersion !== 1) {
        if (statusError?.code === 'PGRST202') throw new Error('La mise à jour de sécurité de la base doit être installée.');
        throw new Error(safeError(statusError?.message || 'Vérification de sécurité indisponible.'));
      }
      const { data: level, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levelError) throw new Error('Impossible de vérifier la double authentification.');
      if (level.currentLevel !== 'aal2') {
        const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
        if (factorError) throw new Error('Impossible de charger la double authentification.');
        if (token !== generation.current) return;
        await clearSnapshot(userId);
        setMfa({ factorId: factors.totp[0]?.id, needsEnrollment: factors.totp.length === 0 }); return;
      }
      await fetchRemote(); await refreshQueue();
    } catch (e) {
      if (token === generation.current) { clearView(); setError(e instanceof Error ? e.message : 'Chargement impossible.'); }
    } finally { if (token === generation.current) setLoading(false); }
  }, [clearView, fetchRemote, refreshQueue, signOut]);
  const sync = useCallback(async () => {
    if (!supabase || !navigator.onLine || !owner.current || lock.current) return;
    if (!stateRef.current.profile) { await loadSession(owner.current); return; }
    lock.current = true; setBusy(true); setError(''); const who = owner.current;
    try {
      await fetchRemote(); // Check current rights before replaying any queued command.
      const list = await listQueue(who);
      for (const item of list) {
        if (owner.current !== who || !stateRef.current.profile) return;
        const { error: rpcError, status } = await supabase.rpc('apply_command', { p_id: item.id, p_command: item.command });
        if (rpcError) {
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) await updateQueue(who, item.id, safeError(rpcError.message));
          setError(`Une saisie reste en attente : ${safeError(rpcError.message)}`); break;
        }
        await deleteQueue(who, item.id);
      }
      await fetchRemote();
    } catch (e) { setError(e instanceof Error ? e.message : 'Connexion impossible. Les saisies sont conservées.'); }
    finally { try { await refreshQueue(); } finally { lock.current = false; setBusy(false); } }
  }, [fetchRemote, loadSession, refreshQueue]);

  useEffect(() => {
    let disposed = false;
    if (!supabase) { void loadSession(); return; }
    // Retire old persistent JWTs without reading or copying their values.
    const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
    localStorage.removeItem(`sb-${project}-auth-token`);
    void supabase.auth.getSession().then(({ data: session }) => { if (!disposed) void loadSession(session.session?.user.id); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (signingIn.current || signingOut.current) return;
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== owner.current)) {
        queueMicrotask(() => { if (!disposed) void loadSession(session?.user.id); });
      }
    });
    return () => { disposed = true; listener.subscription.unsubscribe(); };
  }, [loadSession]);
  useEffect(() => {
    const onOnline = () => { setOnline(true); void sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [sync]);
  useEffect(() => {
    if (!supabase || !profile) return;
    void sync();
    const channel = supabase.channel('bar-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'sync_events' }, () => {
      if (!lock.current) void fetchRemote().catch(e => setError(e.message));
    }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [profile?.id, sync, fetchRemote]);
  useEffect(() => {
    if (!supabase || !profile) return;
    const who = profile.id;
    let lastSent = Date.now(); let touching = false;
    const expireIfNeeded = () => {
      const last = Number(sessionStorage.getItem(activityKey(who)) || 0);
      if (Date.now() - last >= IDLE_TIMEOUT_MS || Date.now() >= expiresAt.current) {
        void signOut().then(() => setError('Session verrouillée après inactivité. Reconnectez-vous.')); return true;
      }
      return false;
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || expireIfNeeded()) return;
      sessionStorage.setItem(activityKey(who), String(Date.now()));
      if (navigator.onLine && !touching && Date.now() - lastSent > 60000) {
        touching = true; lastSent = Date.now();
        void supabase!.rpc('touch_secure_session').then(({ error: rpcError, status }) => {
          touching = false;
          if (rpcError && status >= 400 && status < 500) void signOut().then(() => setError(safeError(rpcError.message)));
        });
      }
    };
    const timer = window.setInterval(expireIfNeeded, 15000);
    const visible = () => { if (document.visibilityState === 'visible') expireIfNeeded(); };
    window.addEventListener('pointerdown', activity); window.addEventListener('keydown', activity); document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); document.removeEventListener('visibilitychange', visible); };
  }, [profile?.id, signOut]);

  const execute = async (command: Command): Promise<'saved' | 'queued'> => {
    if (lock.current) throw new Error('Une opération est en cours. Veuillez patienter.');
    const current = stateRef.current; if (!current.profile) throw new Error('Connectez-vous pour continuer.');
    if (!allowed(current.profile, command.type)) throw new Error('Votre rôle ne permet pas cette action.');
    if (command.type === 'profile.role' && !['admin', 'manager', 'pending'].includes(command.payload.role)) throw new Error('Choisissez un rôle valide.');
    const next = command.type === 'profile.role' && supabase ? current.data : applyCommand(current.data, command, current.profile);
    const who = owner.current; lock.current = true; setBusy(true);
    try {
      if (!supabase) {
        await saveSnapshot('demo', { data: next, profile: current.profile, profiles: [] });
        stateRef.current = { data: next, profile: current.profile }; setData(next); return 'saved';
      }
      if (Date.now() >= expiresAt.current) { await signOut(); throw new Error('Session expirée. Reconnectez-vous.'); }
      if (!navigator.onLine && command.type !== 'sheet.create') throw new Error('Cette opération nécessite Internet. Les fiches peuvent être mises en attente hors connexion.');
      const list = await listQueue(who);
      if (navigator.onLine && list.length) throw new Error('Synchronisez d’abord les opérations en attente.');
      if (command.type === 'sheet.create' && list.some(q => q.command.type === 'sheet.create' && q.command.payload.date === command.payload.date && q.command.payload.employeeId === command.payload.employeeId)) throw new Error('Une fiche pour cette serveuse est déjà en attente.');
      const id = uid(); await addQueue(who, { id, command, createdAt: new Date().toISOString() }); await refreshQueue();
      if (!navigator.onLine) return 'queued';
      const { error: rpcError, status } = await supabase.rpc('apply_command', { p_id: id, p_command: command });
      if (rpcError) {
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          await deleteQueue(who, id); await refreshQueue(); throw new Error(safeError(rpcError.message));
        }
        setError('La réponse du serveur n’a pas été reçue. L’opération reste en attente, sans risque de double validation.'); return 'queued';
      }
      await deleteQueue(who, id); await refreshQueue();
      try { await fetchRemote(); setError(''); } catch { setError('Opération validée. Actualisez les données pour afficher le résultat.'); }
      return 'saved';
    } finally { lock.current = false; setBusy(false); }
  };
  return <Context.Provider value={{ data, profile, profiles, loading, busy, online, demo: !supabase, pending, error, mfa, execute, sync,
    discard: async id => { const row = (await listQueue(owner.current)).find(q => q.id === id); if (!row?.error) return; await deleteQueue(owner.current, id); await refreshQueue(); setError(''); },
    signIn: async (email, password) => {
      signingIn.current = true;
      try {
        const { data: login, error: e } = await supabase!.auth.signInWithPassword({ email, password });
        if (e || !login.user) throw new Error('Connexion impossible. Vérifiez vos identifiants ou patientez avant de réessayer.');
        try { await unlockVault(login.user.id, password); }
        catch (error) { await supabase!.auth.signOut({ scope: 'local' }); throw error; }
        sessionStorage.setItem(activityKey(login.user.id), String(Date.now()));
        await loadSession(login.user.id);
      } finally { signingIn.current = false; }
    },
    signOut,
    finishMfa: async () => { setMfa(null); await loadSession(owner.current); },
  }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('StoreProvider manquant'); return store; }
