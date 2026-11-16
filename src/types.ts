export type Role = 'admin' | 'manager' | 'pending';
export type Page = 'dashboard' | 'daily' | 'team' | 'products' | 'stock' | 'debts' | 'payroll' | 'reports' | 'settings';
export type DebtKind = 'shortage' | 'credit' | 'advance' | 'other';
export interface Profile { id: string; name: string; role: Role }
export interface Employee {
  id: string; name: string; phone: string; sponsor: string; hiredOn: string;
  salary: number; status: 'active' | 'departed'; departedOn?: string; departureReason?: string;
  color: string; restDay: number;
}
export interface Product {
  id: string; name: string; category: 'Locale' | 'Importée' | 'Sans alcool' | 'Autre';
  pack: number; cost: number; price: number; threshold: number; stock: number;
}
export interface SaleLine { productId: string; received: number; sold: number; price: number; cost: number }
export interface Sheet {
  id: string; date: string; employeeId: string; lines: SaleLine[];
  cash: number; momo: number; expense: number; expenseNote: string; deposit: number;
  credit: number; client: string; note: string; shortage: number;
  status: 'validated' | 'reversed'; createdAt: string; reversalReason?: string;
  shortageBasis?: 'sold' | 'received';
}
export interface Debt {
  id: string; employeeId: string; date: string; kind: DebtKind;
  amount: number; balance: number; note: string; sheetId?: string;
}
export interface Settlement { id: string; debtId: string; amount: number; date: string; method: 'cash' | 'momo' | 'payroll' | 'reversal'; note: string }
export interface Movement {
  id: string; date: string; productId: string; quantity: number;
  type: 'supply' | 'issue' | 'inventory' | 'reversal'; note: string; sheetId?: string;
}
export interface Payroll {
  id: string; employeeId: string; month: string; base: number; bonus: number;
  deductions: number; net: number; paidOn: string; allocations: { debtId: string; amount: number }[];
}
export interface Audit { id: string; date: string; actor: string; action: string; detail: string }
export interface Closure { id: string; date: string; closedAt: string; note: string }
export interface Settings {
  barName: string; location: string; shortageAlert: number; debtLimit: number;
  advanceLimit: number; deductionCap: number; closingTime: string; creditAllowed: boolean;
}
export interface Data {
  calculationVersion?: number;
  employees: Employee[]; products: Product[]; sheets: Sheet[]; debts: Debt[];
  settlements: Settlement[]; movements: Movement[]; payrolls: Payroll[];
  audit: Audit[]; closures: Closure[]; settings: Settings;
}
export type Command =
  | { type: 'employee.create'; payload: Employee }
  | { type: 'employee.depart'; payload: { id: string; date: string; reason: string } }
  | { type: 'employee.salary'; payload: { id: string; salary: number } }
  | { type: 'product.create'; payload: Product }
  | { type: 'stock.supply'; payload: { productId: string; quantity: number; note: string; date: string } }
  | { type: 'stock.inventory'; payload: { productId: string; actual: number; note: string; date: string } }
  | { type: 'sheet.create'; payload: Sheet }
  | { type: 'sheet.reverse'; payload: { id: string; reason: string } }
  | { type: 'debt.create'; payload: Debt }
  | { type: 'debt.settle'; payload: { id: string; amount: number; method: 'cash' | 'momo'; note: string; date: string } }
  | { type: 'payroll.pay'; payload: { employeeId: string; month: string; bonus: number } }
  | { type: 'day.close'; payload: { date: string; note: string } }
  | { type: 'settings.update'; payload: Settings }
  | { type: 'profile.role'; payload: { id: string; role: Role } };
export interface QueuedCommand { id: string; command: Command; createdAt: string; error?: string }
