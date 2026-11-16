import { describe, expect, it } from 'vitest';
import { applyCommand, payrollPreview, summary } from '../src/lib/domain';
import { emptyData } from '../src/lib/seed';
import { shiftDate, today, uid } from '../src/lib/format';
import type { Data, Profile, Sheet } from '../src/types';

const admin: Profile = { id: uid(), name: 'Admin', role: 'admin' };
function fixture(): Data {
  const data = emptyData();
  data.employees.push({ id: 'employee', name: 'Grâce Adjovi', phone: '', sponsor: '', hiredOn: shiftDate(today(), -60), salary: 30000, status: 'active', restDay: 0, color: '#dddddd' });
  data.products.push({ id: 'product', name: 'Beaufort', category: 'Locale', pack: 24, cost: 500, price: 1000, stock: 200, threshold: 24 });
  return data;
}
function sheet(overrides: Partial<Sheet> = {}): Sheet { return { id: uid(), date: today(), employeeId: 'employee', lines: [{ productId: 'product', received: 100, sold: 100, price: 1, cost: 1 }], cash: 80000, momo: 15000, expense: 0, expenseNote: '', deposit: 0, credit: 0, client: '', note: '', shortage: 0, status: 'validated', createdAt: '', ...overrides }; }
describe('financial invariants', () => {
  it('calculates 5,000 FCFA shortage server-style and removes stock only once', () => {
    const data = applyCommand(fixture(), { type: 'sheet.create', payload: sheet() }, admin);
    expect(data.sheets[0].shortage).toBe(5000); expect(data.products[0].stock).toBe(100);
    expect(data.debts[0].balance).toBe(5000); expect(data.sheets[0].lines[0].price).toBe(1000);
    expect(summary(data.sheets).sales).toBe(100000);
  });
  it('retains unsold merchandise without treating it as a cash shortage', () => {
    const data = applyCommand(fixture(), { type: 'sheet.create', payload: sheet({ lines: [{ productId: 'product', received: 100, sold: 80, price: 1000, cost: 500 }], cash: 65000 }) }, admin);
    expect(data.sheets[0].shortage).toBe(0); expect(data.products[0].stock).toBe(100); expect(data.debts).toHaveLength(0);
  });
  it('refunds reduce payroll deductions, salary payments never charge the same debt twice', () => {
    let data = applyCommand(fixture(), { type: 'sheet.create', payload: sheet() }, admin);
    data = applyCommand(data, { type: 'debt.settle', payload: { id: data.debts[0].id, amount: 2000, date: today(), method: 'momo', note: 'Règlement' } }, admin);
    expect(payrollPreview(data, data.employees[0], today().slice(0, 7)).net).toBe(27000);
    data = applyCommand(data, { type: 'payroll.pay', payload: { employeeId: 'employee', month: today().slice(0, 7), bonus: 0 } }, admin);
    expect(data.debts[0].balance).toBe(0); expect(data.payrolls[0].deductions).toBe(3000);
    expect(payrollPreview(data, data.employees[0], today().slice(0, 7)).deductions).toBe(0);
    expect(() => applyCommand(data, { type: 'payroll.pay', payload: { employeeId: 'employee', month: today().slice(0, 7), bonus: 0 } }, admin)).toThrow('déjà été payé');
  });
  it('caps deductions and carries debt forward', () => {
    const data = fixture(); data.debts.push({ id: uid(), employeeId: 'employee', date: today(), kind: 'shortage', amount: 50000, balance: 50000, note: 'Écart' });
    const result = payrollPreview(data, data.employees[0], today().slice(0, 7), 2000);
    expect(result.deductions).toBe(15000); expect(result.net).toBe(17000); expect(result.carry).toBe(35000);
  });
  it('rejects duplicate sheets, invalid quantities, surplus and unauthorized payroll', () => {
    const first = sheet(); const data = applyCommand(fixture(), { type: 'sheet.create', payload: first }, admin);
    expect(() => applyCommand(data, { type: 'sheet.create', payload: sheet() }, admin)).toThrow('déjà une fiche');
    expect(() => applyCommand(fixture(), { type: 'sheet.create', payload: sheet({ cash: 100000 }) }, admin)).toThrow('dépasse');
    expect(() => applyCommand(fixture(), { type: 'sheet.create', payload: sheet({ cash: 0.5 }) }, admin)).toThrow('entier');
    expect(() => applyCommand(data, { type: 'payroll.pay', payload: { employeeId: 'employee', month: today().slice(0, 7), bonus: 0 } }, { ...admin, role: 'manager' })).toThrow('rôle');
  });
  it('reverses a sheet using compensating entries and preserves history', () => {
    const first = sheet(); let data = applyCommand(fixture(), { type: 'sheet.create', payload: first }, admin);
    data = applyCommand(data, { type: 'sheet.reverse', payload: { id: first.id, reason: 'Erreur sur la quantité remise' } }, admin);
    expect(data.products[0].stock).toBe(200); expect(data.sheets[0].status).toBe('reversed'); expect(data.debts[0].balance).toBe(0);
    expect(data.movements.filter(m => m.type === 'reversal')).toHaveLength(1); expect(data.settlements[0].method).toBe('reversal');
  });
});
