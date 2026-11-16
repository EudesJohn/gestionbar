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
  await db.exec(await readFile(new URL('../supabase/migrations/202611160002_phase1_rules.sql', import.meta.url), 'utf8'));
  await db.query("insert into auth.users(id,email) values($1,'admin@test.local'),($2,'manager@test.local'),($3,'entry@test.local')", [admin, manager, entry]);
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
  await db.query("update public.profiles set role='manager' where id=$1", [manager]);
  await db.query("update public.profiles set role='entry' where id=$1", [entry]);
  await db.exec(await readFile(new URL('../supabase/migrations/202611160003_remove_entry_role.sql', import.meta.url), 'utf8'));
  date = (await db.query<{ date: string }>("select to_char(public.local_day(),'YYYY-MM-DD') as date")).rows[0].date;
  await db.exec('set role authenticated'); await user(admin);
  await command('employee.create', { id: employee, name: 'Grâce Test', phone: '', sponsor: '', hiredOn: date, salary: 30000, color: '#dddddd', restDay: 0 });
  await command('product.create', { id: product, name: 'Beaufort', category: 'Locale', pack: 24, cost: 500, price: 1000, threshold: 24, stock: 200 });
}, 60000);
afterAll(async () => { await db?.close(); });
describe.sequential('PostgreSQL transactions and authorization', () => {
  it('does not grant access to new accounts, even when signup metadata requests admin', async () => {
    const unapproved = randomUUID();
    await db.exec('reset role');
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'unapproved@test.local','{\"role\":\"admin\"}')", [unapproved]);
    const roles = await db.query<{ role: string }>('select role from public.profiles where id=$1', [unapproved]);
    expect(roles.rows[0].role).toBe('pending');
    await db.exec('set role authenticated'); await user(unapproved);
    await expect(snapshot()).rejects.toThrow('attribution');
    await expect(command('employee.salary', { id: employee, salary: 1 })).rejects.toThrow('attribution');
  });
  it('retires the old role without deleting its account and rejects attempts to reassign it', async () => {
    await user(admin);
    await expect(command('profile.role', { id: entry, role: 'entry' })).rejects.toThrow('profiles_role_check');
    await db.exec('reset role');
    const preserved = await db.query<{ id: string; role: string }>('select id,role from public.profiles where id=$1', [entry]);
    expect(preserved.rows[0]).toEqual({ id: entry, role: 'pending' });
    await db.exec('set role authenticated'); await user(entry);
    await expect(snapshot()).rejects.toThrow('attribution');
    await expect(command('sheet.create', {})).rejects.toThrow('attribution');
    await user(manager); const state = await snapshot();
    expect(state.data.employees[0].salary).toBe(30000);
    await expect(db.query('select * from public.employees')).rejects.toThrow();
    await expect(command('profile.role', { id: manager, role: 'admin' })).rejects.toThrow();
    await expect(command('payroll.pay', { employeeId: employee, month: date.slice(0, 7), bonus: 0 })).rejects.toThrow();
  });
  it('uses the received value and restores a 30,000 salary when a 5,000 debt is settled', async () => {
    await user(admin);
    const employeeId = randomUUID(); const productId = randomUUID();
    await command('employee.create', { id: employeeId, name: 'Test 100 bouteilles', phone: '', sponsor: '', hiredOn: date, salary: 30000, color: '#dddddd', restDay: 0 });
    await command('product.create', { id: productId, name: 'Produit 500 FCFA', category: 'Locale', pack: 24, cost: 300, price: 500, threshold: 10, stock: 100 });
    await command('sheet.create', { id: randomUUID(), date, employeeId, lines: [{ productId, received: 100, sold: 90 }], cash: 45000, momo: 0, expense: 0, expenseNote: '', credit: 0, client: '', deposit: 0, note: 'Exemple du cahier des charges' });
    const state = (await snapshot()).data;
    expect(state.calculationVersion).toBe(2);
    const s = state.sheets.find(s => s.employeeId === employeeId)!;
    expect(s.shortage).toBe(5000); expect(s.shortageBasis).toBe('received');
    const d = state.debts.find(d => d.employeeId === employeeId)!;
    expect(d.balance).toBe(5000); expect(30000-d.balance).toBe(25000);
    await command('debt.settle', { id: d.id, date, amount: 5000, method: 'cash', note: 'Dette entièrement soldée' });
    await command('payroll.pay', { employeeId, month: date.slice(0,7), bonus: 0 });
    expect((await snapshot()).data.payrolls.find(p => p.employeeId === employeeId)?.net).toBe(30000);
  });
  it('calculates shortage using database prices, atomically records stock and debts, retries once', async () => {
    await user(manager); const id = randomUUID(); const payload = { id: randomUUID(), date, employeeId: employee, lines: [{ productId: product, received: 100, sold: 100, price: 1, cost: 1 }], cash: 80000, momo: 15000, expense: 0, expenseNote: '', deposit: 0, credit: 0, client: '', note: '' };
    await command('sheet.create', payload, id); await command('sheet.create', payload, id);
    await user(admin); const state = await snapshot();
    expect(state.data.sheets.filter(s => s.employeeId === employee)).toHaveLength(1); expect(state.data.sheets.find(s => s.employeeId === employee)?.shortage).toBe(5000); expect(state.data.products.find(p => p.id === product)?.stock).toBe(100); expect(state.data.debts.find(d => d.employeeId === employee)?.balance).toBe(5000);
    await expect(command('sheet.create', { ...payload, id: randomUUID() })).rejects.toThrow();
    expect((await snapshot()).data.products.find(p => p.id === product)?.stock).toBe(100);
  });
  it('rolls back failed writes and preserves the immutable audit log', async () => {
    await user(manager);
    await expect(command('stock.supply', { productId: product, date, quantity: -1, note: 'Test invalide' })).rejects.toThrow();
    await expect(command('employee.salary', { id: employee, salary: 0 })).rejects.toThrow();
    await expect(db.query('delete from public.audit_log')).rejects.toThrow();
    await user(admin); expect((await snapshot()).data.products.find(p => p.id === product)?.stock).toBe(100);
  });
  it('prevents editing or deleting a validated sheet even with a privileged table connection', async () => {
    await db.exec('reset role');
    try {
      await expect(db.query('update public.daily_sheets set cash=cash+1 where employee_id=$1', [employee])).rejects.toThrow('annulation');
      await expect(db.query('delete from public.daily_sheets where employee_id=$1', [employee])).rejects.toThrow('suppression');
      await expect(db.query('delete from public.sale_lines')).rejects.toThrow('suppression');
    } finally { await db.exec('set role authenticated'); await user(admin); }
  });
  it('repayment and payroll settle the same balance without a double deduction', async () => {
    await user(manager); const debt = (await snapshot()).data.debts.find(d => d.employeeId === employee)!;
    await command('debt.settle', { id: debt.id, date, amount: 2000, method: 'momo', note: 'Règlement client' });
    await user(admin); await command('payroll.pay', { employeeId: employee, month: date.slice(0, 7), bonus: 0 });
    const state = await snapshot(); const payroll = state.data.payrolls.find(p => p.employeeId === employee)!; expect(payroll.net).toBe(27000); expect(payroll.deductions).toBe(3000); expect(state.data.debts.find(d => d.employeeId === employee)?.balance).toBe(0);
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
