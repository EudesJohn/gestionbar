import type { Command, Data, Debt, Employee, Profile, Sheet } from '../types';
import { today, uid } from './format';

export const activeSheets = (data: Data, date?: string) => data.sheets.filter(s => s.status === 'validated' && (!date || s.date === date));
export const salesValue = (sheet: Sheet) => sheet.lines.reduce((sum, l) => sum + l.sold * l.price, 0);
export const receivedValue = (sheet: Sheet) => sheet.lines.reduce((sum, l) => sum + l.received * l.price, 0);
export const accountableValue = (sheet: Sheet) => sheet.shortageBasis === 'received' ? receivedValue(sheet) : salesValue(sheet);
export const shortageValue = (sheet: Sheet) => accountableValue(sheet) - sheet.cash - sheet.momo - sheet.expense - sheet.credit;
export const remainingValue = (sheet: Sheet) => receivedValue(sheet) - salesValue(sheet);
export const debtTotal = (data: Data, employeeId?: string) => data.debts.filter(d => !employeeId || d.employeeId === employeeId).reduce((s, d) => s + d.balance, 0);
export function summary(sheets: Sheet[]) {
  return sheets.reduce((a, s) => ({ sales: a.sales + salesValue(s), cash: a.cash + s.cash, momo: a.momo + s.momo, shortage: a.shortage + s.shortage, expense: a.expense + s.expense, credit: a.credit + s.credit, deposit: a.deposit + s.deposit }), { sales: 0, cash: 0, momo: 0, shortage: 0, expense: 0, credit: 0, deposit: 0 });
}
export function payrollPreview(data: Data, employee: Employee, month: string, bonus = 0) {
  const debts = data.debts.filter(d => d.employeeId === employee.id && d.date.slice(0, 7) <= month && d.balance > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const outstanding = debts.reduce((s, d) => s + d.balance, 0);
  const deductions = Math.min(outstanding, Math.floor(employee.salary * data.settings.deductionCap / 100));
  let available = deductions;
  const allocations = debts.map(d => { const amount = Math.min(d.balance, available); available -= amount; return { debtId: d.id, amount }; }).filter(a => a.amount > 0);
  return { base: employee.salary, bonus, deductions, net: employee.salary + bonus - deductions, carry: outstanding - deductions, allocations };
}
export function allowed(profile: Profile, type: Command['type']) {
  if (profile.role === 'pending') return false;
  if (profile.role === 'admin') return true;
  if (profile.role === 'entry') return type === 'sheet.create';
  return !['employee.salary', 'payroll.pay', 'settings.update', 'profile.role'].includes(type);
}
function ensure(test: unknown, message: string): asserts test { if (!test) throw new Error(message); }
function integer(value: number, label: string, max = 1_000_000_000) { ensure(Number.isSafeInteger(value) && value >= 0 && value <= max, `${label} : indiquez un entier positif ou nul (maximum ${max}).`); }
function dateValid(value: string) { ensure(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Date invalide.'); ensure(value <= today(), 'La date ne peut pas être dans le futur.'); }
function employeeOf(data: Data, id: string) { const e = data.employees.find(e => e.id === id); ensure(e, 'Serveuse introuvable.'); return e; }
function productOf(data: Data, id: string) { const p = data.products.find(p => p.id === id); ensure(p, 'Produit introuvable.'); return p; }
function checkDebtLimit(data: Data, id: string, amount: number, kind: Debt['kind']) {
  ensure(debtTotal(data, id) + amount <= data.settings.debtLimit, 'Le plafond de dette de cette serveuse est dépassé.');
  if (kind === 'advance') ensure(data.debts.filter(d => d.employeeId === id && d.kind === 'advance').reduce((s, d) => s + d.balance, 0) + amount <= data.settings.advanceLimit, 'Le plafond des avances est dépassé.');
}

// Used for immediate local validation. The database independently validates every command.
export function applyCommand(source: Data, command: Command, profile: Profile): Data {
  ensure(allowed(profile, command.type), 'Votre rôle ne permet pas cette action.');
  const data = structuredClone(source);
  const now = new Date().toISOString();
  let detail = '';
  switch (command.type) {
    case 'employee.create': {
      const e = command.payload; ensure(e.name.trim().length >= 2, 'Indiquez le nom complet.'); integer(e.salary, 'Salaire'); dateValid(e.hiredOn);
      ensure(!data.employees.some(x => x.id === e.id), 'Cette serveuse existe déjà.');
      integer(e.restDay, 'Jour de repos', 6);
      data.employees.push({ ...e, salary: profile.role === 'admin' ? e.salary : 0, status: 'active' }); detail = e.name; break;
    }
    case 'employee.depart': {
      const e = employeeOf(data, command.payload.id); dateValid(command.payload.date); ensure(command.payload.reason.trim().length >= 3, 'Un motif de sortie est nécessaire.');
      ensure(command.payload.date >= e.hiredOn, 'La sortie doit être postérieure à la prise de service.');
      e.status = 'departed'; e.departedOn = command.payload.date; e.departureReason = command.payload.reason; detail = `${e.name} — ${e.departureReason}`; break;
    }
    case 'employee.salary': {
      integer(command.payload.salary, 'Salaire'); const e = employeeOf(data, command.payload.id); e.salary = command.payload.salary; detail = e.name; break;
    }
    case 'product.create': {
      const p = command.payload; ensure(p.name.trim().length >= 2, 'Indiquez un nom de produit.');
      ensure(!data.products.some(x => x.name.toLocaleLowerCase() === p.name.toLocaleLowerCase()), 'Ce produit existe déjà.');
      integer(p.price, 'Prix de vente'); integer(p.cost, "Prix d’achat"); integer(p.stock, 'Stock initial'); integer(p.pack, 'Conditionnement', 1000); integer(p.threshold, 'Seuil'); ensure(p.pack > 0 && p.price > 0, 'Prix et conditionnement doivent être supérieurs à zéro.');
      data.products.push(p); if (p.stock) data.movements.push({ id: uid(), productId: p.id, quantity: p.stock, type: 'supply', date: today(), note: 'Inventaire initial' }); detail = p.name; break;
    }
    case 'stock.supply': {
      const p = productOf(data, command.payload.productId); const c = command.payload; integer(c.quantity, 'Quantité'); dateValid(c.date); ensure(c.quantity > 0 && c.note.trim(), 'Indiquez une quantité et le fournisseur.');
      p.stock += c.quantity; data.movements.push({ id: uid(), productId: p.id, quantity: c.quantity, type: 'supply', note: c.note, date: c.date }); detail = `${p.name} · +${c.quantity} bouteilles`; break;
    }
    case 'stock.inventory': {
      const c = command.payload; const p = productOf(data, c.productId); integer(c.actual, 'Stock réel'); dateValid(c.date); ensure(c.note.trim().length >= 3, 'Expliquez le comptage ou l’écart.');
      const diff = c.actual - p.stock; data.movements.push({ id: uid(), productId: p.id, quantity: diff, type: 'inventory', note: c.note, date: c.date }); p.stock = c.actual; detail = `${p.name} · écart ${diff}`; break;
    }
    case 'sheet.create': {
      const s = structuredClone(command.payload); const e = employeeOf(data, s.employeeId); dateValid(s.date);
      ensure(e.status === 'active' && s.date >= e.hiredOn, 'Cette serveuse n’est pas en service à cette date.');
      ensure(!data.closures.some(c => c.date === s.date), 'Cette journée est déjà clôturée.');
      ensure(!activeSheets(data, s.date).some(x => x.employeeId === s.employeeId), 'Cette serveuse a déjà une fiche validée ce jour.');
      ensure(s.lines.length > 0, 'Ajoutez au moins un produit.');
      ensure(new Set(s.lines.map(l => l.productId)).size === s.lines.length, 'Un produit ne doit apparaître qu’une seule fois.');
      for (const l of s.lines) {
        const p = productOf(data, l.productId); integer(l.received, 'Quantité reçue', 100000); integer(l.sold, 'Quantité vendue', 100000);
        ensure(l.received > 0 && l.sold <= l.received, 'La quantité vendue ne peut pas dépasser la quantité reçue.');
        ensure(l.received <= p.stock, `Stock insuffisant : ${p.name} (${p.stock} disponible).`);
        l.price = p.price; l.cost = p.cost; p.stock -= l.received;
      }
      for (const key of ['cash', 'momo', 'expense', 'deposit', 'credit'] as const) integer(s[key], key);
      ensure(!s.expense || s.expenseNote.trim().length >= 3, 'Justifiez les dépenses.');
      ensure(!s.credit || (data.settings.creditAllowed && s.client.trim().length >= 2), 'Le crédit doit être autorisé et le client identifié.');
      ensure(s.deposit <= s.cash + s.momo, 'Le dépôt ne peut pas dépasser le total remis.');
      s.shortageBasis = 'received';
      ensure(receivedValue(s) <= 1_000_000_000, 'La valeur totale de la fiche dépasse le maximum autorisé.');
      const shortage = shortageValue(s); ensure(shortage >= 0, 'Le total déclaré dépasse la marchandise prise. Corrigez les montants avant validation.');
      // A real shortage must always be recorded, even if it exceeds a warning limit.
      if (s.credit) checkDebtLimit(data, e.id, s.credit, 'credit');
      s.shortage = shortage; s.status = 'validated'; s.createdAt = now;
      data.sheets.push(s);
      for (const l of s.lines) data.movements.push({ id: uid(), date: s.date, productId: l.productId, quantity: -l.received, type: 'issue', sheetId: s.id, note: e.name });
      if (shortage) data.debts.push({ id: uid(), employeeId: e.id, date: s.date, kind: 'shortage', amount: shortage, balance: shortage, sheetId: s.id, note: `Manquant de la fiche du ${s.date}` });
      if (s.credit) data.debts.push({ id: uid(), employeeId: e.id, date: s.date, kind: 'credit', amount: s.credit, balance: s.credit, sheetId: s.id, note: s.client });
      detail = `${e.name} · ${s.date}`; break;
    }
    case 'sheet.reverse': {
      const s = data.sheets.find(s => s.id === command.payload.id && s.status === 'validated'); ensure(s, 'Fiche introuvable ou déjà annulée.');
      ensure(command.payload.reason.trim().length >= 5, 'Un motif détaillé est obligatoire.');
      ensure(!data.closures.some(c => c.date === s.date), 'Une journée clôturée ne peut pas être annulée.');
      ensure(!data.debts.some(d => d.sheetId === s.id && d.amount !== d.balance), 'Cette fiche comporte déjà un règlement. Une régularisation comptable est nécessaire.');
      s.status = 'reversed'; s.reversalReason = command.payload.reason;
      for (const l of s.lines) { productOf(data, l.productId).stock += l.received; data.movements.push({ id: uid(), date: today(), productId: l.productId, quantity: l.received, type: 'reversal', sheetId: s.id, note: command.payload.reason }); }
      for (const d of data.debts.filter(d => d.sheetId === s.id)) { data.settlements.push({ id: uid(), debtId: d.id, amount: d.balance, date: today(), method: 'reversal', note: command.payload.reason }); d.balance = 0; }
      detail = command.payload.reason; break;
    }
    case 'debt.create': {
      const d = command.payload; employeeOf(data, d.employeeId); dateValid(d.date); integer(d.amount, 'Montant'); ensure(d.amount > 0 && d.note.trim().length >= 3, 'Indiquez un montant et un motif.');
      ensure(d.kind !== 'credit' || data.settings.creditAllowed, 'Les ventes à crédit sont désactivées.');
      if (d.kind !== 'shortage') checkDebtLimit(data, d.employeeId, d.amount, d.kind);
      data.debts.push({ ...d, balance: d.amount, sheetId: undefined }); detail = d.note; break;
    }
    case 'debt.settle': {
      const c = command.payload; const d = data.debts.find(d => d.id === c.id); ensure(d, 'Dette introuvable.'); integer(c.amount, 'Remboursement'); dateValid(c.date);
      ensure(c.date >= d.date, 'Le remboursement doit être postérieur à la dette.'); ensure(c.amount > 0 && c.amount <= d.balance, 'Le montant doit être compris entre 1 FCFA et le solde restant.');
      d.balance -= c.amount; data.settlements.push({ id: uid(), debtId: d.id, amount: c.amount, method: c.method, date: c.date, note: c.note }); detail = `${employeeOf(data, d.employeeId).name} · ${c.amount} FCFA`; break;
    }
    case 'payroll.pay': {
      const c = command.payload; ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month) && c.month <= today().slice(0, 7), 'Mois invalide.'); integer(c.bonus, 'Prime'); const e = employeeOf(data, c.employeeId);
      ensure(c.month >= e.hiredOn.slice(0, 7) && (!e.departedOn || c.month <= e.departedOn.slice(0, 7)), 'La serveuse n’était pas en contrat durant ce mois.');
      ensure(!data.payrolls.some(p => p.employeeId === e.id && p.month === c.month), 'Le salaire de ce mois a déjà été payé.');
      const p = payrollPreview(data, e, c.month, c.bonus); ensure(p.base > 0, 'Définissez d’abord le salaire de base.');
      for (const a of p.allocations) { const d = data.debts.find(d => d.id === a.debtId)!; d.balance -= a.amount; data.settlements.push({ id: uid(), debtId: d.id, amount: a.amount, date: today(), method: 'payroll', note: `Salaire ${c.month}` }); }
      data.payrolls.push({ id: uid(), employeeId: e.id, month: c.month, base: p.base, bonus: p.bonus, deductions: p.deductions, net: p.net, allocations: p.allocations, paidOn: today() }); detail = `${e.name} · ${c.month}`; break;
    }
    case 'day.close': {
      const c = command.payload; dateValid(c.date); ensure(!data.closures.some(x => x.date === c.date), 'Journée déjà clôturée.');
      const sheets = activeSheets(data, c.date); ensure(sheets.length > 0, 'Aucune fiche à clôturer.');
      ensure(sheets.every(s => shortageValue(s) === s.shortage), 'Un écart reste à expliquer.');
      const weekday = new Date(`${c.date}T12:00:00Z`).getUTCDay();
      const missing = data.employees.filter(e => e.hiredOn <= c.date && (!e.departedOn || e.departedOn > c.date) && e.restDay !== weekday && !sheets.some(s => s.employeeId === e.id));
      ensure(missing.length === 0 || c.note.trim().length >= 5, 'Expliquez les absences dans le rappel avant de clôturer.');
      data.closures.push({ id: uid(), date: c.date, closedAt: now, note: c.note }); detail = c.date; break;
    }
    case 'settings.update': {
      const s = command.payload; ensure(s.barName.trim() && s.location.trim(), 'Nom du bar et localisation obligatoires.');
      integer(s.shortageAlert, 'Seuil de manquant'); integer(s.debtLimit, 'Plafond des dettes'); integer(s.advanceLimit, 'Plafond des avances'); integer(s.deductionCap, 'Retenue maximale', 100);
      ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(s.closingTime), 'Heure invalide.'); data.settings = s; detail = 'Paramètres de l’établissement'; break;
    }
    case 'profile.role': throw new Error('La gestion des comptes nécessite une connexion Supabase.');
  }
  data.audit.unshift({ id: uid(), date: now, actor: profile.name, action: command.type, detail });
  return data;
}
