import { describe, expect, it } from 'vitest';
import { analyze, analyticsRange, currentDebtDistribution, datesBetween, stockCoverage } from '../src/lib/analytics';
import { emptyData } from '../src/lib/seed';
import type { Data, Sheet } from '../src/types';

function fixture(): Data {
  const data = emptyData();
  data.employees = [{ id: 'alice', name: 'Alice Test', salary: 30000, phone: '', sponsor: '', hiredOn: '2026-01-01', status: 'departed', departedOn: '2026-11-17', color: '#dddddd', restDay: 0 }];
  data.products = [{ id: 'beer', name: 'Bière test', category: 'Locale', pack: 24, price: 9999, cost: 999, stock: 10, threshold: 24 }];
  return data;
}
function sheet(id: string, date: string, sold: number, overrides: Partial<Sheet> = {}): Sheet {
  return { id, date, employeeId: 'alice', lines: [{ productId: 'beer', received: sold + 2, sold, price: 500, cost: 300 }], cash: sold * 300, momo: sold * 100, shortage: sold * 100, expense: 0, expenseNote: '', credit: 0, client: '', deposit: 0, note: '', status: 'validated', createdAt: `${date}T12:00:00Z`, ...overrides };
}
describe('chart data reflects the validated financial history', () => {
  it('keeps historic prices, excludes reversals and includes departed employees in past performance', () => {
    const data = fixture();
    data.sheets = [sheet('first', '2026-11-10', 10), sheet('second', '2026-11-12', 20, { expense: 1000 }), sheet('reversed', '2026-11-12', 500, { status: 'reversed' }), sheet('future', '2026-11-18', 200)];
    const report = analyze(data, '2026-11-10', '2026-11-16');
    expect(report.totals.sales).toBe(15000); expect(report.margin).toBe(6000);
    expect(report.totals.cash).toBe(9000); expect(report.totals.momo).toBe(3000); expect(report.totals.expense).toBe(1000);
    expect(report.products[0]).toMatchObject({ units: 30, sales: 15000, margin: 6000 });
    expect(report.employees[0]).toMatchObject({ name: 'Alice Test', days: 2, sales: 15000 });
    expect(report.recordedDays).toBe(2); expect(report.average).toBe(7500);
    expect(report.daily.find(day => day.date === '2026-11-11')).toMatchObject({ sales: 0, records: 0 });
    expect(report.categories.reduce((sum, category) => sum + category.value, 0)).toBe(report.totals.sales);
  });
  it('compares the same number of preceding days and conserves totals across grouping boundaries', () => {
    const data = fixture();
    data.sheets = [sheet('a', '2026-10-28', 2), sheet('b', '2026-10-29', 4), sheet('c', '2026-10-30', 6), sheet('d', '2026-10-31', 8), sheet('e', '2026-11-01', 10), sheet('f', '2026-11-02', 12)];
    for (const grouping of ['day', 'week', 'month'] as const) {
      const report = analyze(data, '2026-10-31', '2026-11-02', grouping);
      expect([report.previousFrom, report.previousTo]).toEqual(['2026-10-28', '2026-10-30']);
      expect(report.sales.reduce((sum, point) => sum + point.values[0], 0)).toBe(15000);
      expect(report.sales.reduce((sum, point) => sum + point.values[1], 0)).toBe(6000);
      expect(report.payments.reduce((sum, point) => sum + point.values[0] + point.values[1], 0)).toBe(12000);
    }
    expect(analyze(data, '2026-10-31', '2026-11-02', 'week').sales).toHaveLength(2);
    expect(analyze(data, '2026-10-31', '2026-11-02', 'month').sales).toHaveLength(2);
  });
  it('does not invent activity or suppress negative margin', () => {
    const data = fixture();
    const empty = analyze(data, '2026-11-01', '2026-11-17');
    expect(empty.average).toBe(0); expect(empty.marginRate).toBe(0); expect(empty.bestDay).toBeUndefined(); expect(empty.products).toHaveLength(0);
    data.sheets.push(sheet('loss', '2026-11-17', 1, { lines: [{ productId: 'beer', received: 1, sold: 1, price: 500, cost: 700 }] }));
    const loss = analyze(data, '2026-11-17', '2026-11-17');
    expect(loss.margin).toBe(-200); expect(loss.marginRate).toBe(-40); expect(loss.margins[0].values[0]).toBe(-200);
  });
  it('uses current debt balances and orders current stock by alert coverage', () => {
    const data = fixture();
    data.debts = [
      { id: 'old', employeeId: 'alice', date: '2026-01-01', kind: 'credit', amount: 5000, balance: 2000, note: '' },
      { id: 'paid', employeeId: 'alice', date: '2026-11-17', kind: 'shortage', amount: 3000, balance: 0, note: '' },
    ];
    expect(currentDebtDistribution(data).find(item => item.kind === 'credit')?.value).toBe(2000);
    expect(currentDebtDistribution(data).find(item => item.kind === 'shortage')?.value).toBe(0);
    data.products.push({ ...data.products[0], id: 'available', name: 'Disponible', stock: 100, threshold: 20 });
    expect(stockCoverage(data).map(product => product.id)).toEqual(['beer', 'available']);
  });
  it('handles month starts, leap days and invalid dates explicitly', () => {
    expect(analyticsRange('2026-11-01', 'month')).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(analyticsRange('2026-11-01', 'week').from).toBe('2026-10-26');
    expect(datesBetween('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(datesBetween('2026-02-30', '2026-03-01')).toEqual([]);
    expect(() => analyze(fixture(), '2026-11-17', '2026-11-01')).toThrow('période valide');
  });
});
