import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Data, Profile, QueuedCommand } from '../types';

export interface Snapshot { data: Data; profile: Profile; profiles: Profile[] }
export interface Envelope { version: 1; iv: string; ciphertext: string }
interface SnapshotRow { key: string; sealed: Envelope }
interface QueueRow { id: string; owner: string; createdAt: string; sealed: Envelope }
interface SaltRow { owner: string; salt: string }
type LegacySnapshot = Snapshot & { key: string };
type LegacyQueue = QueuedCommand & { owner: string };
const db = new Dexie('comptoir-v1') as Dexie & {
  cache: Table<LegacySnapshot>; queue: Table<LegacyQueue>; snapshots: Table<SnapshotRow>;
  outbox: Table<QueueRow>; salts: Table<SaltRow>;
};
db.version(1).stores({ cache: 'key', queue: 'id, owner, createdAt' });
db.version(2).stores({ cache: 'key', queue: 'id, owner, createdAt', snapshots: 'key', outbox: 'id, owner, createdAt', salts: 'owner' })
  .upgrade(transaction => transaction.table('cache').filter(row => row.key !== 'demo').delete().then(() => undefined));
const keys = new Map<string, CryptoKey>();
const keyName = (owner: string) => `comptoir-vault-${owner}`;
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const decode = (value: string) => Uint8Array.from(atob(value), x => x.charCodeAt(0));

export async function deriveVaultKey(password: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: decode(salt), iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
export async function seal(key: CryptoKey, value: unknown, context: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(JSON.stringify(value)));
  // Chunked encoding avoids argument limits for large snapshots.
  let binary = ''; const bytes = new Uint8Array(encrypted);
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { version: 1, iv: encode(iv), ciphertext: btoa(binary) };
}
export async function unseal<T>(key: CryptoKey, sealed: Envelope, context: string): Promise<T> {
  if (sealed.version !== 1) throw new Error('Version du cache inconnue.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(sealed.iv), additionalData: new TextEncoder().encode(context) }, key, decode(sealed.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
async function keyFor(owner: string): Promise<CryptoKey> {
  if (keys.has(owner)) return keys.get(owner)!;
  const stored = sessionStorage.getItem(keyName(owner));
  if (!stored) throw new Error('Reconnectez-vous pour déverrouiller les données de cet appareil.');
  const key = await crypto.subtle.importKey('raw', decode(stored), 'AES-GCM', true, ['encrypt', 'decrypt']);
  keys.set(owner, key); return key;
}
export function isVaultUnlocked(owner: string) { return keys.has(owner) || !!sessionStorage.getItem(keyName(owner)); }
export async function unlockVault(owner: string, password: string) {
  let salt = await db.salts.get(owner);
  if (!salt) { salt = { owner, salt: encode(crypto.getRandomValues(new Uint8Array(16))) }; await db.salts.add(salt); }
  const key = await deriveVaultKey(password, salt.salt);
  // Preserve unsent work if the password has changed: do not silently overwrite it.
  const first = await db.outbox.where('owner').equals(owner).first();
  if (first) {
    try { await unseal(key, first.sealed, `queue:${owner}:${first.id}`); }
    catch { throw new Error('Des fiches locales sont chiffrées avec un ancien mot de passe. Récupérez-les avant de modifier l’accès de cet appareil.'); }
  }
  keys.set(owner, key);
  sessionStorage.setItem(keyName(owner), encode(new Uint8Array(await crypto.subtle.exportKey('raw', key))));
  // Migrate only the current user's legacy outbox, preserving every unsent command.
  for (const item of await db.queue.where('owner').equals(owner).toArray()) {
    const { owner: _owner, ...command } = item;
    if (!await db.outbox.get(item.id)) await addQueue(owner, command);
    await db.queue.delete(item.id);
  }
  await db.cache.delete(owner); // Synced snapshots can be downloaded again.
}
export async function clearSnapshot(owner: string) { await db.snapshots.delete(owner); await db.cache.delete(owner); }
export async function lockVault(owner: string) {
  keys.delete(owner); sessionStorage.removeItem(keyName(owner));
  await clearSnapshot(owner);
}
export async function readSnapshot(owner: string): Promise<Snapshot | undefined> {
  if (owner === 'demo') return db.cache.get('demo');
  const row = await db.snapshots.get(owner);
  if (!row) return undefined;
  try { return await unseal<Snapshot>(await keyFor(owner), row.sealed, `snapshot:${owner}`); }
  catch { await db.snapshots.delete(owner); return undefined; }
}
export async function saveSnapshot(owner: string, snapshot: Snapshot) {
  if (owner === 'demo') { await db.cache.put({ key: owner, ...snapshot }); return; }
  await db.snapshots.put({ key: owner, sealed: await seal(await keyFor(owner), snapshot, `snapshot:${owner}`) });
}
export async function listQueue(owner: string): Promise<QueuedCommand[]> {
  if (!owner || owner === 'demo' || !isVaultUnlocked(owner)) return [];
  const key = await keyFor(owner);
  const rows = await db.outbox.where('owner').equals(owner).sortBy('createdAt');
  return Promise.all(rows.map(row => unseal<QueuedCommand>(key, row.sealed, `queue:${owner}:${row.id}`)));
}
export async function addQueue(owner: string, item: QueuedCommand) {
  await db.outbox.add({ id: item.id, owner, createdAt: item.createdAt, sealed: await seal(await keyFor(owner), item, `queue:${owner}:${item.id}`) });
}
export async function updateQueue(owner: string, id: string, error: string) {
  const row = await db.outbox.get(id); if (!row || row.owner !== owner) return;
  const key = await keyFor(owner); const item = await unseal<QueuedCommand>(key, row.sealed, `queue:${owner}:${id}`);
  await db.outbox.update(id, { sealed: await seal(key, { ...item, error }, `queue:${owner}:${id}`) });
}
export async function deleteQueue(owner: string, id: string) {
  const row = await db.outbox.get(id); if (row?.owner === owner) await db.outbox.delete(id);
}
