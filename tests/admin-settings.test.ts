import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import handler from '../api/admin-settings';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const getUser = vi.fn(); const signIn = vi.fn(); const signOut = vi.fn(); const rpc = vi.fn(); const single = vi.fn(); const requestAuth = vi.fn();
const updateProfile = vi.fn(); const updateEq = vi.fn(); const updateSelect = vi.fn(); const updateSingle = vi.fn();
const payload = { action: 'password', currentPassword: 'old-password-for-test', password: 'new-long-password-for-test' };
async function request(body: unknown = payload, origin = 'https://gestionbar-amber.vercel.app') {
  let output = ''; let status = 200;
  const res = { setHeader: vi.fn(), get statusCode() { return status; }, set statusCode(value: number) { status = value; }, end: (body: string) => { output = body; } } as unknown as ServerResponse;
  await handler({ method: 'POST', headers: { origin, authorization: 'Bearer verified-session', 'content-type': 'application/json' }, body } as IncomingMessage & { body: unknown }, res);
  return { status, body: JSON.parse(output) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-key');
  getUser.mockResolvedValue({ data: { user: { id: 'admin-id', email: 'owner@example.test' } }, error: null });
  single.mockResolvedValue({ data: { role: 'admin' }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  signIn.mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null }); signOut.mockResolvedValue({ error: null });
  requestAuth.mockResolvedValue({ ok: true, status: 200 }); vi.stubGlobal('fetch', requestAuth);
  updateSingle.mockResolvedValue({ data: { id: 'admin-id', name: 'Eudes Johnson' }, error: null });
  const updateQuery = { eq: updateEq, select: updateSelect, single: updateSingle };
  updateEq.mockReturnValue(updateQuery); updateSelect.mockReturnValue(updateQuery); updateProfile.mockReturnValue(updateQuery);
  vi.mocked(createClient).mockImplementation((_url, key) => (key === 'private-key'
    ? { from: () => ({ select: () => ({ eq: () => ({ single }) }), update: updateProfile }) }
    : { auth: { getUser, signInWithPassword: signIn, signOut }, rpc }) as unknown as ReturnType<typeof createClient>);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('administrator personal credentials', () => {
  it('rejects managers, missing MFA and foreign origins', async () => {
    single.mockResolvedValue({ data: { role: 'manager' }, error: null });
    expect((await request()).status).toBe(403);
    single.mockResolvedValue({ data: { role: 'admin' }, error: null }); rpc.mockResolvedValue({ error: { message: 'MFA_REQUIRED' } });
    expect((await request()).status).toBe(403);
    expect((await request(payload, 'https://evil.example')).status).toBe(403);
    expect(signIn).not.toHaveBeenCalled(); expect(requestAuth).not.toHaveBeenCalled();
  });
  it('uses the authenticated account, never an arbitrary target ID or supplied current email', async () => {
    expect((await request({ ...payload, userId: 'other-user' })).status).toBe(422);
    expect((await request({ ...payload, currentEmail: 'other@example.test' })).status).toBe(422);
    expect(requestAuth).not.toHaveBeenCalled();
  });
  it('blocks an incorrect current password and enforces rate limits before verification', async () => {
    signIn.mockResolvedValue({ data: { user: null }, error: { message: 'wrong' } });
    expect((await request()).status).toBe(403);
    expect(requestAuth).not.toHaveBeenCalled();
    signIn.mockClear(); rpc.mockResolvedValue({ data: false, error: null });
    expect((await request()).status).toBe(429); expect(signIn).not.toHaveBeenCalled();
  });
  it('changes only the logged-in admin password after reauthentication and closes the temporary session', async () => {
    const result = await request(); expect(result.status).toBe(200); expect(result.body.reauthenticate).toBe(true);
    expect(signIn).toHaveBeenCalledWith({ email: 'owner@example.test', password: payload.currentPassword });
    expect(requestAuth).toHaveBeenCalledWith('https://test.supabase.co/auth/v1/user', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ password: payload.password }), headers: expect.objectContaining({ Authorization: 'Bearer verified-session' }) }));
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(JSON.stringify(result)).not.toContain(payload.password);
  });
  it('preserves native email confirmation instead of auto-confirming a new address', async () => {
    const result = await request({ action: 'email', currentPassword: payload.currentPassword, email: 'New@example.test' });
    expect(result.body.confirmationRequired).toBe(true);
    expect(requestAuth).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ email: 'new@example.test' }) }));
  });
  it('updates only the authenticated administrator display name in the profile source of truth', async () => {
    const result = await request({ action: 'name', name: '  Eudes   Johnson  ' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: 'admin-id', name: 'Eudes Johnson' });
    expect(rpc).toHaveBeenCalledWith('touch_secure_session');
    expect(updateProfile).toHaveBeenCalledWith({ name: 'Eudes Johnson' });
    expect(updateEq.mock.calls).toEqual([['id', 'admin-id'], ['role', 'admin']]);
    expect(signIn).not.toHaveBeenCalled(); expect(signOut).not.toHaveBeenCalled(); expect(requestAuth).not.toHaveBeenCalled();
  });
  it('denies display-name changes from managers, expired sessions and requests targeting another account', async () => {
    single.mockResolvedValue({ data: { role: 'manager' }, error: null });
    expect((await request({ action: 'name', name: 'Nouveau nom' })).status).toBe(403);
    single.mockResolvedValue({ data: { role: 'admin' }, error: null });
    expect((await request({ action: 'name', name: 'Nouveau nom', userId: 'another-user' })).status).toBe(422);
    expect((await request({ action: 'name', name: 'Nouveau nom', role: 'admin' })).status).toBe(422);
    rpc.mockResolvedValue({ data: null, error: { message: 'SESSION_EXPIRED' } });
    expect((await request({ action: 'name', name: 'Nouveau nom' })).status).toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('validates the display name and reports a rejected write without claiming success', async () => {
    for (const name of ['', ' ', 'A', 'x'.repeat(151), 'Nom\nDeux lignes', 123, null]) {
      expect((await request({ action: 'name', name })).status).toBe(422);
    }
    expect(updateProfile).not.toHaveBeenCalled();
    updateSingle.mockResolvedValue({ data: null, error: { message: 'No matching administrator' } });
    expect((await request({ action: 'name', name: 'Nouveau nom' })).status).toBe(409);
  });
});
