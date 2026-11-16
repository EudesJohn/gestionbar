import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const admin = randomUUID(), manager = randomUUID(), entry = randomUUID(), employee = randomUUID(), product = randomUUID();
let db: PGlite; let date: string;
async function user(id: string) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); }
async function command(type: string, payload: object, id = randomUUID()) { return db.query('select public.apply_command($1,$2::jsonb) as result', [id, JSON.stringify({ type, payload })]); }
async function snapshot() { const result = await db.query<{ state: { data: import('../src/types').Data; profile: import('../src/types').Profile } }>('select public.get_snapshot() as state'); return result.rows[0].state; }
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611160001_comptoir.sql', import.meta.url), 'utf8'));
  await db.query("insert into auth.users(id,email) values($1,'admin@test.local'),($2,'manager@test.local'),($3,'entry@test.local')", [admin, manager, entry]);
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
  await db.query("update public.profiles set role='manager' where id=$1", [manager]);
  date = (await db.query<{ date: string }>("select to_char(public.local_day(),'YYYY-MM-DD') as date")).rows[0].date;
  await db.exec('set role authenticated'); await user(admin);
  await command('employee.create', { id: employee, name: 'Grâce Test', phone: '', sponsor: '', hiredOn: date, salary: 30000, color: '#dddddd', restDay: 0 });
  await command('product.create', { id: product, name: 'Beaufort', category: 'Locale', pack: 24, cost: 500, price: 1000, threshold: 24, stock: 200 });
}, 60000);
afterAll(async () => { await db?.close(); });
describe.sequential('PostgreSQL transactions and authorization', () => {
  it('hides salary data and denies direct table access and role escalation', async () => {
    await user(entry); const state = await snapshot();
    expect(state.data.employees[0].salary).toBe(0); expect(state.data.products[0].cost).toBe(0); expect(state.data.payrolls).toEqual([]);
    await expect(db.query('select * from public.employees')).rejects.toThrow();
    await expect(command('profile.role', { id: entry, role: 'admin' })).rejects.toThrow();
    await expect(command('payroll.pay', { employeeId: employee, month: date.slice(0, 7), bonus: 0 })).rejects.toThrow();
  });
  it('calculates shortage using database prices, atomically records stock and debts, retries once', async () => {
    await user(entry); const id = randomUUID(); const payload = { id: randomUUID(), date, employeeId: employee, lines: [{ productId: product, received: 100, sold: 100, price: 1, cost: 1 }], cash: 80000, momo: 15000, expense: 0, expenseNote: '', deposit: 0, credit: 0, client: '', note: '' };
    await command('sheet.create', payload, id); await command('sheet.create', payload, id);
    await user(admin); const state = await snapshot();
    expect(state.data.sheets).toHaveLength(1); expect(state.data.sheets[0].shortage).toBe(5000); expect(state.data.products[0].stock).toBe(100); expect(state.data.debts[0].balance).toBe(5000);
    await expect(command('sheet.create', { ...payload, id: randomUUID() })).rejects.toThrow();
    expect((await snapshot()).data.products[0].stock).toBe(100);
  });
  it('rolls back failed writes and preserves the immutable audit log', async () => {
    await user(manager);
    await expect(command('stock.supply', { productId: product, date, quantity: -1, note: 'Test invalide' })).rejects.toThrow();
    await expect(command('employee.salary', { id: employee, salary: 0 })).rejects.toThrow();
    await expect(db.query('delete from public.audit_log')).rejects.toThrow();
    await user(admin); expect((await snapshot()).data.products[0].stock).toBe(100);
  });
  it('repayment and payroll settle the same balance without a double deduction', async () => {
    await user(manager); const debt = (await snapshot()).data.debts[0];
    await command('debt.settle', { id: debt.id, date, amount: 2000, method: 'momo', note: 'Règlement client' });
    await user(admin); await command('payroll.pay', { employeeId: employee, month: date.slice(0, 7), bonus: 0 });
    const state = await snapshot(); expect(state.data.payrolls[0].net).toBe(27000); expect(state.data.payrolls[0].deductions).toBe(3000); expect(state.data.debts[0].balance).toBe(0);
    await expect(command('payroll.pay', { employeeId: employee, month: date.slice(0, 7), bonus: 0 })).rejects.toThrow();
    await expect(command('sheet.reverse', { id: state.data.sheets[0].id, reason: 'Correction avec règlement' })).rejects.toThrow();
  });
  it('locks the closed day against new sheets and reversal', async () => {
    await user(admin); await command('day.close', { date, note: 'Journée vérifiée' });
    const state = await snapshot(); expect(state.data.closures).toHaveLength(1);
    await expect(command('sheet.reverse', { id: state.data.sheets[0].id, reason: 'Correction après clôture' })).rejects.toThrow();
    expect(state.data.audit.length).toBeGreaterThan(5);
  });
});
