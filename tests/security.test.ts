import { describe, expect, it } from 'vitest';
import { deriveVaultKey, seal, unseal } from '../src/lib/private-storage';
import { safeError, sessionDeadline, SESSION_LIMIT_MS } from '../src/lib/security';

describe('encrypted offline storage', () => {
  const salt = btoa('fixed-test-salt-for-pbkdf2');
  it('encrypts data with independent IVs and binds it to its owner and row', async () => {
    const key = await deriveVaultKey('test-only-long-password', salt);
    const value = { salary: 30000, employee: 'Données confidentielles' };
    const a = await seal(key, value, 'queue:user-a:row-1');
    const b = await seal(key, value, 'queue:user-a:row-1');
    expect(a.iv).not.toBe(b.iv); expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain('30000');
    expect(await unseal(key, a, 'queue:user-a:row-1')).toEqual(value);
    await expect(unseal(key, a, 'queue:user-b:row-1')).rejects.toThrow();
    const wrongKey = await deriveVaultKey('different-test-password', salt);
    await expect(unseal(wrongKey, a, 'queue:user-a:row-1')).rejects.toThrow();
    const bytes = Uint8Array.from(atob(a.ciphertext), c => c.charCodeAt(0)); bytes[0] ^= 1;
    await expect(unseal(key, { ...a, ciphertext: btoa(String.fromCharCode(...bytes)) }, 'queue:user-a:row-1')).rejects.toThrow();
  });
  it('supports snapshots larger than browser argument limits', async () => {
    const key = await deriveVaultKey('test-only-long-password', salt);
    const value = { history: 'data'.repeat(100000) };
    expect(await unseal(key, await seal(key, value, 'snapshot:one'), 'snapshot:one')).toEqual(value);
  });
});
describe('session helpers', () => {
  const jwt = (payload: object) => 'header.' + btoa(JSON.stringify(payload)) + '.signature';
  it('does not extend the session deadline when a token refreshes or MFA happens later', () => {
    const authAt = 1780000000;
    expect(sessionDeadline(jwt({ iat: authAt + 9999, amr: [{ method: 'password', timestamp: authAt }, { method: 'totp', timestamp: authAt + 20 }] }))).toBe(authAt * 1000 + SESSION_LIMIT_MS);
    expect(sessionDeadline('malformed')).toBe(0);
    expect(sessionDeadline(jwt({ iat: authAt }))).toBe(0);
  });
  it('hides database internals and translates security errors', () => {
    expect(safeError('relation secret_table does not exist')).not.toContain('secret_table');
    expect(safeError('MFA_REQUIRED')).toContain('double authentification');
    expect(safeError('SESSION_REVOKED')).toContain('Reconnectez-vous');
  });
});
