import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Dexie from 'dexie';
import type { Table } from 'dexie';
import { supabase } from './lib/supabase';
import { createDemoData, emptyData } from './lib/seed';
import { allowed, applyCommand } from './lib/domain';
import { uid } from './lib/format';
import type { Command, Data, Profile, QueuedCommand } from './types';

const db = new Dexie('comptoir-v1') as Dexie & { cache: Table<{ key: string; data: Data; profile: Profile; profiles: Profile[] }>; queue: Table<QueuedCommand & { owner: string }> };
db.version(1).stores({ cache: 'key', queue: 'id, owner, createdAt' });
const demoProfile: Profile = { id: 'demo-admin', name: 'Eudes Johnson', role: 'admin' };
interface Store {
  data: Data; profile: Profile | null; profiles: Profile[]; loading: boolean; busy: boolean;
  online: boolean; demo: boolean; pending: QueuedCommand[]; error: string;
  execute: (c: Command) => Promise<'saved' | 'queued'>; sync: () => Promise<void>; discard: (id: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(emptyData);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<QueuedCommand[]>([]);
  const [error, setError] = useState('');
  const stateRef = useRef({ data, profile }); stateRef.current = { data, profile };
  const lock = useRef(false); const owner = useRef(''); const generation = useRef(0);
  const refreshQueue = useCallback(async () => { const list = await db.queue.where('owner').equals(owner.current).sortBy('createdAt'); setPending(list); return list; }, []);
  const fetchRemote = useCallback(async () => {
    if (!supabase || !owner.current) return;
    const who = owner.current;
    const { data: result, error: rpcError, status } = await supabase.rpc('get_snapshot');
    if (owner.current !== who) return;
    if (rpcError) {
      if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || rpcError.code === 'P0001') {
        const cleared = emptyData();
        stateRef.current = { data: cleared, profile: null };
        setData(cleared); setProfile(null); setProfiles([]); setPending([]);
        await db.cache.delete(who);
      }
      throw new Error(rpcError.message);
    }
    const snapshot = result as { data: Data; profile: Profile; profiles: Profile[] };
    if (!['admin', 'manager'].includes(snapshot.profile.role)) {
      const cleared = emptyData();
      stateRef.current = { data: cleared, profile: null };
      setData(cleared); setProfile(null); setProfiles([]); setPending([]);
      await db.cache.delete(who);
      throw new Error('Votre compte attend l’attribution d’un rôle par l’administrateur.');
    }
    await db.cache.put({ key: who, ...snapshot });
    if (owner.current !== who) return;
    setData(snapshot.data); setProfile(snapshot.profile); setProfiles(snapshot.profiles);
    stateRef.current = { data: snapshot.data, profile: snapshot.profile };
  }, []);
  const sync = useCallback(async () => {
    if (!supabase || !navigator.onLine || !owner.current || lock.current) return;
    lock.current = true; setBusy(true); setError(''); const who = owner.current;
    try {
      const list = await db.queue.where('owner').equals(who).sortBy('createdAt');
      for (const item of list) {
        if (owner.current !== who) return;
        const { error: rpcError, status } = await supabase.rpc('apply_command', { p_id: item.id, p_command: item.command });
        if (rpcError) {
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) await db.queue.update(item.id, { error: rpcError.message });
          setError(`Une saisie reste en attente : ${rpcError.message}`); break;
        }
        await db.queue.delete(item.id);
      }
      await fetchRemote();
    } catch (e) { setError(e instanceof Error ? e.message : 'Connexion impossible. Les saisies sont conservées.'); }
    finally { await refreshQueue(); lock.current = false; setBusy(false); }
  }, [fetchRemote, refreshQueue]);
  useEffect(() => {
    let disposed = false;
    const load = async (userId?: string) => {
      const token = ++generation.current; setLoading(true); setError(''); owner.current = userId || (supabase ? '' : 'demo');
      if (stateRef.current.profile?.id !== userId && supabase) { setProfile(null); setData(emptyData()); setProfiles([]); setPending([]); }
      try {
        if (!supabase) {
          const cached = await db.cache.get('demo'); const next = cached?.data || createDemoData();
          if (!disposed) { setData(next); setProfile(demoProfile); }
          await db.cache.put({ key: 'demo', data: next, profile: demoProfile, profiles: [] });
        } else if (userId) {
          const cached = await db.cache.get(userId);
          if (cached && ['admin', 'manager'].includes(cached.profile.role) && !disposed && token === generation.current && owner.current === userId) { setData(cached.data); setProfile(cached.profile); setProfiles(cached.profiles); }
          if (navigator.onLine) await fetchRemote();
          else if (!cached) throw new Error('Une première connexion à Internet est nécessaire.');
          await refreshQueue();
        } else { setProfile(null); setProfiles([]); setData(emptyData()); setPending([]); }
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Chargement impossible.'); }
      finally { if (!disposed && token === generation.current) setLoading(false); }
    };
    if (!supabase) void load();
    else {
      void supabase.auth.getSession().then(({ data: session }) => load(session.session?.user.id));
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && (session?.user.id !== owner.current || !stateRef.current.profile))) queueMicrotask(() => void load(session?.user.id));
      });
      return () => { disposed = true; listener.subscription.unsubscribe(); };
    }
    return () => { disposed = true; };
  }, [fetchRemote, refreshQueue]);
  useEffect(() => {
    const onOnline = () => { setOnline(true); void sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [sync]);
  useEffect(() => {
    if (!supabase || !profile) return;
    void sync();
    const channel = supabase.channel('bar-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'sync_events' }, () => { if (!lock.current) void fetchRemote().catch(e => setError(e.message)); }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [profile?.id, sync, fetchRemote]); // Only resubscribe on account changes.
  const execute = async (command: Command): Promise<'saved' | 'queued'> => {
    if (lock.current) throw new Error('Une opération est en cours. Veuillez patienter.');
    const current = stateRef.current; if (!current.profile) throw new Error('Connectez-vous pour continuer.');
    if (!allowed(current.profile, command.type)) throw new Error('Votre rôle ne permet pas cette action.');
    if (command.type === 'profile.role' && !['admin', 'manager', 'pending'].includes(command.payload.role)) throw new Error('Choisissez un rôle valide.');
    if (supabase && ['sheet.create', 'day.close'].includes(command.type) && current.data.calculationVersion !== 2) throw new Error('La mise à jour des règles de calcul est en attente. Installez la migration de phase 1 pour valider une fiche.');
    const next = command.type === 'profile.role' && supabase ? current.data : applyCommand(current.data, command, current.profile);
    lock.current = true; setBusy(true);
    try {
      if (!supabase) {
        await db.cache.put({ key: 'demo', data: next, profile: current.profile, profiles: [] });
        stateRef.current = { data: next, profile: current.profile }; setData(next);
        return 'saved';
      } else {
        if (!navigator.onLine && command.type !== 'sheet.create') throw new Error('Cette opération nécessite Internet. Les fiches journalières peuvent être mises en attente hors connexion.');
        const list = await db.queue.where('owner').equals(owner.current).toArray();
        if (navigator.onLine && list.length) throw new Error('Synchronisez d’abord les opérations en attente avant une nouvelle validation.');
        if (command.type === 'sheet.create' && list.some(q => q.command.type === 'sheet.create' && q.command.payload.date === command.payload.date && q.command.payload.employeeId === command.payload.employeeId)) throw new Error('Une fiche pour cette serveuse est déjà en attente.');
        // Persist the idempotency key before sending. A lost response can be retried safely.
        const id = uid();
        await db.queue.add({ id, owner: owner.current, command, createdAt: new Date().toISOString() });
        await refreshQueue();
        if (!navigator.onLine) return 'queued';
        const { error: rpcError, status } = await supabase.rpc('apply_command', { p_id: id, p_command: command });
        if (rpcError) {
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            await db.queue.delete(id); await refreshQueue(); throw new Error(rpcError.message);
          }
          setError('La réponse du serveur n’a pas été reçue. L’opération est conservée avec son identifiant pour éviter un doublon.');
          return 'queued';
        }
        await db.queue.delete(id); await refreshQueue();
        try { await fetchRemote(); setError(''); }
        catch { setError('Opération validée. Actualisez les données pour afficher le nouveau résultat.'); }
        return 'saved';
      }
    } finally { lock.current = false; setBusy(false); }
  };
  const discard = async (id: string) => { const row = await db.queue.get(id); if (row?.owner !== owner.current || !row.error) return; await db.queue.delete(id); await refreshQueue(); setError(''); };
  return <Context.Provider value={{ data, profile, profiles, loading, busy, online, demo: !supabase, pending, error, execute, sync, discard,
    signIn: async (email, password) => { const { error: e } = await supabase!.auth.signInWithPassword({ email, password }); if (e) throw new Error('Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.'); },
    signOut: async () => { if (supabase) { const { error: e } = await supabase.auth.signOut(); if (e) throw e; } },
  }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('StoreProvider manquant'); return store; }
