import type { Data, Employee, Product, Sheet } from '../types';
import { shiftDate, today, uid } from './format';
import { shortageValue } from './domain';

export function emptyData(): Data {
  return { employees: [], products: [], sheets: [], debts: [], settlements: [], movements: [], payrolls: [], audit: [], closures: [], settings: { barName: 'Le Comptoir', location: 'Pobè, Bénin', shortageAlert: 5000, debtLimit: 50000, advanceLimit: 15000, deductionCap: 50, closingTime: '23:00', creditAllowed: true } };
}
export function createDemoData(): Data {
  const data = emptyData(); const date = today();
  const names = ['Aminata Bello', 'Grâce Adjovi', 'Priscille Dossou', 'Estelle Agossou', 'Mariam Sanni', 'Chantal Hounkpe', 'Rose Akakpo', 'Nadège Ahouansou'];
  const colors = ['#d8e8de', '#f0dfd6', '#e7e2f3', '#f3e7cb', '#dbe7f0', '#f1dce4', '#dfebd4', '#e6e0d6'];
  data.employees = names.map((name, i): Employee => ({ id: uid(), name, phone: `+229 01 97 00 12 ${30 + i}`, sponsor: ['Mme Adjovi', 'M. Dossou', 'Mme Bello'][i % 3], hiredOn: shiftDate(date, -90 - i * 12), salary: i < 2 ? 35000 : 30000, status: 'active', color: colors[i], restDay: i >= 6 ? new Date(`${date}T12:00:00Z`).getUTCDay() : (new Date(`${date}T12:00:00Z`).getUTCDay() + 1 + i % 5) % 7 }));
  const catalog: [string, Product['category'], number, number, number, number][] = [
    ['Beaufort', 'Locale', 24, 450, 700, 186], ['Heineken', 'Importée', 24, 700, 1000, 72],
    ['Desperado canette', 'Importée', 24, 850, 1200, 18], ['Savana', 'Importée', 24, 700, 1000, 48],
    ['Voddy', 'Locale', 24, 350, 500, 96], ['Rox', 'Sans alcool', 24, 350, 500, 64],
    ['Ira', 'Locale', 12, 500, 800, 36], ['Sangria', 'Importée', 12, 900, 1500, 24],
    ['Hollandia grand', 'Importée', 24, 700, 1000, 56], ['Hollandia petit', 'Importée', 24, 400, 600, 42],
    ['Budweiser bouteille', 'Importée', 24, 700, 1000, 84], ['Budweiser canette', 'Importée', 24, 600, 900, 12],
    ['Légende', 'Locale', 24, 400, 600, 72], ['Exotic', 'Sans alcool', 24, 300, 500, 8],
    ['Blond alc', 'Locale', 24, 400, 600, 64], ['Blond sans alc', 'Sans alcool', 24, 350, 500, 52],
    ['Yaourt', 'Autre', 12, 250, 400, 30],
  ];
  data.products = catalog.map(([name, category, pack, cost, price, stock]): Product => ({ id: uid(), name, category, pack, cost, price, stock, threshold: 24 }));
  for (let days = 13; days >= 0; days--) {
    const day = shiftDate(date, -days);
    for (let i = 0; i < 6; i++) {
      const factor = days === 0 ? [1.35, 1.2, 1.05, 0.95, 0.85, 0.7][i] : 0.65 + ((days * 7 + i * 3) % 9) / 12;
      const lines = [0, 1, 2, 3, 4].map((idx, j) => { const p = data.products[idx]; const sold = Math.round(([28, 18, 10, 12, 16][j] + i % 3) * factor); return { productId: p.id, received: sold, sold, price: p.price, cost: p.cost }; });
      const total = lines.reduce((sum, l) => sum + l.sold * l.price, 0);
      const shortage = days === 0 ? [0, 1500, 0, 2000, 0, 1000][i] : (i + days) % 7 === 0 ? 1000 : 0;
      const credit = days === 0 && i === 2 ? 3000 : 0;
      const expense = days === 0 && i === 0 ? 1500 : 0;
      const momo = Math.floor(total * (0.22 + i * 0.025) / 500) * 500;
      const s: Sheet = { id: uid(), date: day, employeeId: data.employees[i].id, lines, cash: total - momo - shortage - credit - expense, momo, expense, expenseNote: expense ? 'Transport des casiers' : '', deposit: 0, credit, client: credit ? 'M. Koffi — 97 00 00 12' : '', shortage, note: '', status: 'validated', createdAt: `${day}T${14 + i}:15:00.000Z` };
      data.sheets.push(s);
      if (days <= 3 && shortageValue(s)) data.debts.push({ id: uid(), employeeId: s.employeeId, date: day, kind: 'shortage', amount: shortage, balance: shortage, sheetId: s.id, note: 'Écart constaté à la remise de caisse' });
      if (credit) data.debts.push({ id: uid(), employeeId: s.employeeId, date: day, kind: 'credit', amount: credit, balance: credit, sheetId: s.id, note: s.client });
    }
  }
  data.debts.push({ id: uid(), employeeId: data.employees[3].id, date: shiftDate(date, -5), kind: 'advance', amount: 10000, balance: 10000, note: 'Avance pour frais de scolarité' });
  const settledId = uid();
  data.debts.push({ id: settledId, employeeId: data.employees[0].id, date: shiftDate(date, -2), kind: 'credit', amount: 5000, balance: 0, note: 'M. Pascal — crédit régularisé' });
  data.settlements.push({ id: uid(), debtId: settledId, amount: 5000, date, method: 'momo', note: 'Règlement du client' });
  data.movements = data.products.map(p => ({ id: uid(), date: shiftDate(date, -14), productId: p.id, quantity: p.stock, type: 'supply', note: 'Stock de démonstration' }));
  data.audit = [
    { id: uid(), date: `${date}T18:15:00Z`, actor: 'Robert Adé', action: 'sheet.create', detail: 'Chantal Hounkpe · fiche journalière validée' },
    { id: uid(), date: `${date}T17:35:00Z`, actor: 'Robert Adé', action: 'debt.settle', detail: 'Aminata Bello · 5 000 FCFA remboursés' },
    { id: uid(), date: `${date}T16:20:00Z`, actor: 'Robert Adé', action: 'stock.supply', detail: 'Beaufort · réception de 4 casiers' },
  ];
  return data;
}
