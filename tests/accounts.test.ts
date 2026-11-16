import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import handler from '../api/accounts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const createUser = vi.fn(); const getUser = vi.fn(); const rpc = vi.fn(); const single = vi.fn();
const fixtures = { name: 'Gérant Test', email: 'gerant@test.example', password: 'Test-fixture-password-234!', role: 'manager' };
async function request(body: unknown = fixtures, authorization: string | undefined = 'Bearer test-session', method = 'POST', origin = 'https://gestionbar-amber.vercel.app') {
  const headers: Record<string, string> = {};
  let status = 200; let output = '';
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, get statusCode() { return status; }, set statusCode(s: number) { status = s; }, end: (value: string) => { output = value; } } as unknown as ServerResponse;
  const req = { method, headers: { authorization, origin, 'content-type': 'application/json' }, body } as IncomingMessage & { body: unknown };
  await handler(req, res);
  return { status, body: JSON.parse(output), headers };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-test-key');
  getUser.mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null });
  single.mockResolvedValue({ data: { role: 'admin' }, error: null });
  createUser.mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null });
  rpc.mockImplementation(async name => name === 'authorize_account_creation' ? { data: true, error: null } : { error: null });
  vi.mocked(createClient).mockImplementation((_url, key) => (key === 'private-test-key'
    ? { from: () => ({ select: () => ({ eq: () => ({ single }) }) }), auth: { admin: { createUser } } }
    : { auth: { getUser }, rpc }) as unknown as ReturnType<typeof createClient>);
});
afterEach(() => vi.unstubAllEnvs());
describe('administrator account endpoint', () => {
  it('rejects missing or invalid sessions before creating anything', async () => {
    expect((await request(fixtures, '')).status).toBe(401);
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    expect((await request()).status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('denies managers and pending users even if the body claims administrator status', async () => {
    for (const role of ['manager', 'entry', 'pending']) {
      single.mockResolvedValue({ data: { role }, error: null });
      expect((await request({ ...fixtures, actorRole: 'admin' })).status).toBe(403);
    }
    expect(createUser).not.toHaveBeenCalled();
  });
  it('validates the password and allowed roles before calling Supabase Auth', async () => {
    expect((await request({ ...fixtures, password: '1234' })).status).toBe(422);
    expect((await request({ ...fixtures, role: 'service_role' })).status).toBe(422);
    expect((await request({ ...fixtures, role: 'entry' })).status).toBe(422);
    expect((await request({ ...fixtures, email: 'invalid' })).status).toBe(422);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('creates an account then assigns its role through the acting administrator RPC', async () => {
    const result = await request();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ id: 'new-user-id', role: 'manager', email: fixtures.email });
    expect(JSON.stringify(result.body)).not.toContain(fixtures.password);
    expect(createUser).toHaveBeenCalledWith({ email: fixtures.email, password: fixtures.password, email_confirm: true, user_metadata: { name: fixtures.name } });
    expect(rpc).toHaveBeenCalledWith('apply_command', expect.objectContaining({ p_command: { type: 'profile.role', payload: { id: 'new-user-id', role: 'manager' } } }));
    expect(result.headers['Cache-Control']).toBe('no-store');
  });
  it('leaves an unprivileged account and reports partial failure if role assignment fails', async () => {
    rpc.mockImplementation(async name => name === 'authorize_account_creation' ? { data: true, error: null } : { error: { message: 'Role revoked during request' } });
    const result = await request();
    expect(result.status).toBe(409); expect(result.body.created).toBe(true);
    expect(result.body.error).toContain('sans accès');
  });
  it('reports duplicate email and does not overwrite an existing user', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
    expect((await request()).status).toBe(409); expect(rpc).not.toHaveBeenCalledWith('apply_command', expect.anything());
  });
  it('rejects foreign origins and oversized parsed bodies before creating a user', async () => {
    expect((await request(fixtures, 'Bearer test-session', 'POST', 'https://evil.example')).status).toBe(403);
    expect((await request({ ...fixtures, extra: 'x'.repeat(9000) })).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('fails closed without MFA, a live session, or a working security RPC', async () => {
    rpc.mockResolvedValue({ error: { message: 'MFA_REQUIRED' }, data: null });
    expect((await request()).status).toBe(403); expect(createUser).not.toHaveBeenCalled();
  });
  it('enforces the committed account-creation limit before calling Auth', async () => {
    rpc.mockResolvedValue({ error: null, data: false });
    const result = await request(); expect(result.status).toBe(429); expect(result.headers['Retry-After']).toBe('600');
    expect(createUser).not.toHaveBeenCalled();
  });
});
