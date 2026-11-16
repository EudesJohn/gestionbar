import type { Data } from '../types';
import { activeSheets, receivedValue, summary } from './domain';
import { dateLabel, monthLabel, shiftDate } from './format';

export type AnalyticsPeriod = 'day' | 'week' | 'month';
export type Grouping = 'day' | 'week' | 'month';
export interface ChartPoint { label: string; detail: string; values: number[] }
export interface Series { label: string; color: string; dashed?: boolean }
export const chartColors = { green: '#267052', gold: '#b48739', blue: '#426e99', purple: '#8063a6', orange: '#c07936', red: '#b4534b', muted: '#849a8c' };
export const periodLabels: Record<AnalyticsPeriod, string> = { day: 'Jour', week: '7 jours', month: 'Ce mois' };
export const groupingLabels: Record<Grouping, string> = { day: 'Par jour', week: 'Par semaine', month: 'Par mois' };

export function analyticsRange(date: string, period: AnalyticsPeriod) {
  return { from: period === 'day' ? date : period === 'week' ? shiftDate(date, -6) : `${date.slice(0, 7)}-01`, to: date };
}
export function datesBetween(from: string, to: string) {
  if (![from, to].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date)) return [];
  const count = Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  if (!Number.isFinite(count) || count < 1 || count > 366) return [];
  return Array.from({ length: count }, (_, i) => shiftDate(from, i));
}
function groupKey(date: string, group: Grouping) {
  if (group === 'month') return date.slice(0, 7);
  if (group === 'week') return shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  return date;
}
export function analyze(data: Data, from: string, to: string, grouping: Grouping = 'day') {
  const dates = datesBetween(from, to);
  if (!dates.length) throw new Error('Choisissez une période valide de 1 à 366 jours.');
  const allSheets = activeSheets(data);
  const sheets = allSheets.filter(sheet => sheet.date >= from && sheet.date <= to);
  const totals = summary(sheets);
  const previousFrom = shiftDate(from, -dates.length);
  const previousTo = shiftDate(from, -1);
  const previous = summary(allSheets.filter(sheet => sheet.date >= previousFrom && sheet.date <= previousTo));
  const byDate = new Map<string, typeof sheets>();
  for (const sheet of allSheets) { const group = byDate.get(sheet.date) || []; group.push(sheet); byDate.set(sheet.date, group); }
  const daily = dates.map(date => {
    const daySheets = byDate.get(date) || [];
    return {
      date, ...summary(daySheets), records: daySheets.length,
      margin: daySheets.reduce((sum, sheet) => sum + sheet.lines.reduce((s, l) => s + l.sold * (l.price - l.cost), 0), 0),
      previousSales: summary(byDate.get(shiftDate(date, -dates.length)) || []).sales,
    };
  });
  const buckets = new Map<string, typeof daily>();
  for (const day of daily) { const key = groupKey(day.date, grouping); const group = buckets.get(key) || []; group.push(day); buckets.set(key, group); }
  const grouped = [...buckets.entries()].map(([key, days]) => {
    const start = days[0].date; const end = days[days.length - 1].date;
    const label = grouping === 'month' ? monthLabel(key) : grouping === 'week' && start !== end
      ? `${dateLabel(start, { day: 'numeric' })}–${dateLabel(end, { day: 'numeric', month: 'short' })}`
      : dateLabel(start, { day: 'numeric', month: 'short' });
    const detail = start === end ? dateLabel(start, { weekday: 'long', day: 'numeric', month: 'long' }) : `Du ${dateLabel(start)} au ${dateLabel(end)}`;
    return { label, detail, sales: days.reduce((s, d) => s + d.sales, 0), previous: days.reduce((s, d) => s + d.previousSales, 0), cash: days.reduce((s, d) => s + d.cash, 0), momo: days.reduce((s, d) => s + d.momo, 0), margin: days.reduce((s, d) => s + d.margin, 0), expense: days.reduce((s, d) => s + d.expense, 0), shortage: days.reduce((s, d) => s + d.shortage, 0), credit: days.reduce((s, d) => s + d.credit, 0) };
  });
  const products = data.products.map(product => {
    const lines = sheets.flatMap(sheet => sheet.lines.filter(line => line.productId === product.id));
    return { id: product.id, name: product.name, category: product.category, sales: lines.reduce((sum, line) => sum + line.sold * line.price, 0), units: lines.reduce((sum, line) => sum + line.sold, 0), margin: lines.reduce((sum, line) => sum + line.sold * (line.price - line.cost), 0) };
  }).filter(product => product.units > 0).sort((a, b) => b.sales - a.sales);
  const employees = data.employees.map(employee => {
    const individual = sheets.filter(sheet => sheet.employeeId === employee.id);
    const sum = summary(individual);
    const taken = individual.reduce((s, sheet) => s + receivedValue(sheet), 0);
    return { id: employee.id, name: employee.name, color: employee.color, sales: sum.sales, shortage: sum.shortage, days: new Set(individual.map(sheet => sheet.date)).size, shortageRate: taken ? sum.shortage / taken * 100 : 0 };
  }).filter(employee => employee.days > 0).sort((a, b) => b.sales - a.sales);
  const categories = ['Locale', 'Importée', 'Sans alcool', 'Autre'].map(category => ({ label: category, value: products.filter(p => p.category === category).reduce((sum, p) => sum + p.sales, 0) }));
  const margin = daily.reduce((sum, day) => sum + day.margin, 0);
  const bestDay = daily.filter(day => day.records > 0).sort((a, b) => b.sales - a.sales)[0];
  const recordedDays = daily.filter(day => day.records > 0).length;
  return {
    from, to, previousFrom, previousTo, sheets, totals, previous, margin, daily, employees, products, categories, bestDay, recordedDays,
    average: recordedDays ? Math.round(totals.sales / recordedDays) : 0,
    marginRate: totals.sales ? margin / totals.sales * 100 : 0,
    sales: grouped.map(d => ({ label: d.label, detail: d.detail, values: [d.sales, d.previous] })),
    payments: grouped.map(d => ({ label: d.label, detail: d.detail, values: [d.cash, d.momo] })),
    margins: grouped.map(d => ({ label: d.label, detail: d.detail, values: [d.margin, d.expense] })),
    gaps: grouped.map(d => ({ label: d.label, detail: d.detail, values: [d.shortage, d.credit] })),
  };
}
export function currentDebtDistribution(data: Data) {
  return (['shortage', 'credit', 'advance', 'other'] as const).map(kind => ({ kind, value: data.debts.filter(debt => debt.kind === kind).reduce((sum, debt) => sum + debt.balance, 0) }));
}
export function stockCoverage(data: Data) {
  return [...data.products].sort((a, b) => a.stock / Math.max(a.threshold, 1) - b.stock / Math.max(b.threshold, 1)).slice(0, 7);
}
export const percentage = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value) + ' %';
export const shortAmount = (value: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
