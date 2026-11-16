import { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Download, TrendingUp, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { analyze, analyticsRange, percentage } from '../lib/analytics';
import type { AnalyticsPeriod, Grouping } from '../lib/analytics';
import { dateLabel, fcfa, money, shiftDate, today } from '../lib/format';
import { exportReport } from '../lib/exports';
import { AnalyticsPanels, PaymentDonut, SalesTrend, TrendBadge } from './charts/AnalyticsPanels';
import { Avatar, Badge, Button, Empty, PageTitle, SectionTitle, Stat } from './ui';

export function ReportsPage({ date, setDate, notify }: { date: string; setDate: (date: string) => void; notify: (message: string) => void }) {
  const { data } = useStore();
  const [period, setPeriod] = useState<AnalyticsPeriod | 'quarter'>('week');
  const [grouping, setGrouping] = useState<Grouping>('day');
  const [exporting, setExporting] = useState(false);
  const from = period === 'quarter' ? shiftDate(date, -89) : analyticsRange(date, period).from;
  const analytics = useMemo(() => analyze(data, from, date, grouping), [data, from, date, grouping]);
  const { sheets, totals, margin, employees, previous } = analytics;
  const download = async (format: 'pdf' | 'xlsx') => {
    setExporting(true);
    try { await exportReport(data, sheets, format, `${from}_${date}`); notify(`Rapport ${format === 'pdf' ? 'PDF' : 'Excel'} téléchargé.`); }
    catch { notify('Le téléchargement a échoué. Réessayez.'); }
    finally { setExporting(false); }
  };
  return <>
    <PageTitle eyebrow="PRENDRE DU RECUL, MIEUX DÉCIDER" title="Rapports & performance" description="Explorez votre activité en courbes, en chiffres et en couleurs."
      actions={<><Button variant="secondary" icon={Download} disabled={exporting} onClick={() => void download('xlsx')}>Excel</Button><Button icon={Download} disabled={exporting} onClick={() => void download('pdf')}>Rapport PDF</Button></>} />
    <div className="analytics-toolbar reports-toolbar">
      <div className="segmented" role="group" aria-label="Période du rapport">
        {([['day', 'Journalier'], ['week', '7 derniers jours'], ['month', 'Ce mois'], ['quarter', '90 derniers jours']] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => { setPeriod(value); if (value === 'day') setGrouping('day'); }}>{label}</button>)}
      </div>
      <label className="date-input"><CalendarDays size={16} /><input type="date" aria-label="Date de fin du rapport" value={date} max={today()} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label>
    </div>
    <div className="report-period-label"><span>Du {dateLabel(from)} au {dateLabel(date)}</span><TrendBadge current={totals.sales} previous={previous.sales} /></div>
    <div className="stats-grid">
      <Stat label="Chiffre d’affaires" value={money(totals.sales)} icon={TrendingUp} />
      <Stat label="Marge brute estimée" value={money(margin)} icon={Banknote} color="blue" />
      <Stat label="Dépenses" value={money(totals.expense)} icon={Wallet} color="purple" />
      <Stat label="Manquants" value={money(totals.shortage)} icon={Wallet} color="orange" />
    </div>
    <div className="analytics-lead">
      <SalesTrend data={data} from={from} to={date} grouping={grouping} onGrouping={setGrouping} />
      <PaymentDonut data={data} from={from} to={date} />
    </div>
    <AnalyticsPanels data={data} from={from} to={date} grouping={grouping} extended />
    <section className="panel secondary-section">
      <SectionTitle title="Détail de la performance de l’équipe" description={`${dateLabel(from)} — ${dateLabel(date)} · montants en FCFA`} />
      <div className="table-scroll secondary-section"><table><thead><tr><th>Serveuse</th><th className="numeric">Ventes</th><th className="numeric">Jours enregistrés</th><th className="numeric">Taux de manquants</th></tr></thead>
        <tbody>{employees.map((employee, index) => <tr key={employee.id}>
          <td><div className="person-cell"><span className="ranking-number">{index + 1}</span><Avatar name={employee.name} size="sm" color={employee.color} /><strong>{employee.name}</strong></div></td>
          <td className="numeric strong">{fcfa(employee.sales)}</td><td className="numeric">{employee.days}</td>
          <td className="numeric"><Badge tone={employee.shortage ? 'orange' : 'green'}>{percentage(employee.shortageRate)}</Badge></td>
        </tr>)}</tbody>
      </table></div>
      {!employees.length && <Empty title="Pas encore de ventes" text="Sélectionnez une période avec des fiches enregistrées." />}
    </section>
    <div className="info-box page-info"><TrendingUp size={20} /><p>Les graphiques de ventes utilisent uniquement les fiches validées de la période. La marge brute utilise les prix historiques et exclut les charges fixes, les salaires et les pertes d’inventaire. Les graphiques de dettes et de réserve montrent la situation actuelle, toutes dates confondues.</p></div>
  </>;
}
