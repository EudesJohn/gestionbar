import type { Data, Payroll, Sheet } from '../types';
import { salesValue, summary } from './domain';
import { fcfa, dateLabel, monthLabel } from './format';

export async function exportReport(data: Data, sheets: Sheet[], format: 'pdf' | 'xlsx', period: string) {
  const rows = sheets.map(s => ({ Date: s.date, Serveuse: data.employees.find(e => e.id === s.employeeId)?.name || 'Archivée', Ventes: salesValue(s), Cash: s.cash, Momo: s.momo, Dépenses: s.expense, Crédit: s.credit, Manquant: s.shortage }));
  const totals = summary(sheets);
  if (format === 'xlsx') {
    const { Workbook } = await import('exceljs'); const book = new Workbook(); const sheet = book.addWorksheet('Ventes');
    sheet.columns = Object.keys(rows[0] || { Date: '', Serveuse: '', Ventes: '', Cash: '', Momo: '', Dépenses: '', Crédit: '', Manquant: '' }).map(key => ({ header: key, key, width: key === 'Serveuse' ? 25 : 17 }));
    rows.forEach(row => sheet.addRow(row));
    sheet.addRow({ Serveuse: 'TOTAL', Ventes: totals.sales, Cash: totals.cash, Momo: totals.momo, Dépenses: totals.expense, Crédit: totals.credit, Manquant: totals.shortage });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF143D32' } };
    const buffer = await book.xlsx.writeBuffer(); download(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `comptoir-${period}.xlsx`);
  } else {
    const { jsPDF } = await import('jspdf'); const { default: autoTable } = await import('jspdf-autotable'); const pdf = new jsPDF({ orientation: 'landscape' });
    pdf.setFontSize(22); pdf.setTextColor('#143d32'); pdf.text(`${data.settings.barName} - Rapport des ventes`, 14, 22);
    pdf.setFontSize(10); pdf.setTextColor('#63736d'); pdf.text(`${period} | Montants en FCFA`, 14, 30);
    autoTable(pdf, { startY: 38, head: [['Date', 'Serveuse', 'Ventes', 'Cash', 'Momo', 'Dépenses', 'Crédit', 'Manquant']], body: rows.map(r => Object.values(r)), foot: [['TOTAL', '', totals.sales, totals.cash, totals.momo, totals.expense, totals.credit, totals.shortage]], headStyles: { fillColor: [20, 61, 50] }, styles: { fontSize: 9 } });
    pdf.save(`comptoir-${period}.pdf`);
  }
}
export async function exportPayroll(data: Data, payroll: Payroll) {
  const { jsPDF } = await import('jspdf'); const { default: autoTable } = await import('jspdf-autotable'); const pdf = new jsPDF();
  const employee = data.employees.find(e => e.id === payroll.employeeId)!;
  pdf.setFontSize(22); pdf.setTextColor('#143d32'); pdf.text(data.settings.barName, 18, 25);
  pdf.setFontSize(12); pdf.text(`Relevé de salaire - ${monthLabel(payroll.month)}`, 18, 38); pdf.text(employee.name, 18, 48);
  const rows: (string | number)[][] = [['Salaire de base', payroll.base], ['Prime', payroll.bonus], ...payroll.allocations.map(a => [data.debts.find(d => d.id === a.debtId)?.note || 'Retenue', -a.amount]), ['Net payé', payroll.net]];
  autoTable(pdf, { startY: 58, head: [['Désignation', 'Montant (FCFA)']], body: rows, headStyles: { fillColor: [20, 61, 50] } });
  pdf.setFontSize(10); pdf.text(`Paiement enregistré le ${dateLabel(payroll.paidOn)}.`, 18, 280);
  pdf.save(`salaire-${employee.name.replace(/\s+/g, '-')}-${payroll.month}.pdf`);
}
export function recap(data: Data, sheets: Sheet[], date: string) {
  const s = summary(sheets); return `${data.settings.barName} — ${dateLabel(date)}\nVentes : ${fcfa(s.sales)}\nCash : ${fcfa(s.cash)}\nMobile Money : ${fcfa(s.momo)}\nDépenses : ${fcfa(s.expense)}\nManquants : ${fcfa(s.shortage)}\nCrédits clients : ${fcfa(s.credit)}\n${sheets.length} fiches validées.`;
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
