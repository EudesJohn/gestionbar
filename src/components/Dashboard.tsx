import { ArrowRight, ArrowUpRight, Banknote, CalendarDays, Check, ChevronDown, CircleAlert, Clock3, ClipboardList, Download, Package, Plus, Smartphone, TrendingUp, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { activeSheets, receivedValue, salesValue, summary } from '../lib/domain';
import { dateLabel, fcfa, money, shiftDate, shortName, today } from '../lib/format';
import { Avatar, Badge, Button, SectionTitle, Stat } from './ui';
import type { Page } from '../types';
import type { ModalState } from './Forms';
import { exportReport } from '../lib/exports';
import { analyze, analyticsRange, periodLabels } from '../lib/analytics';
import type { AnalyticsPeriod, Grouping } from '../lib/analytics';
import { AnalyticsPanels, PaymentDonut, SalesTrend } from './charts/AnalyticsPanels';

interface Props { date: string; setDate: (date: string) => void; navigate: (page: Page) => void; open: (modal: ModalState) => void; notify: (text: string) => void }
export function Dashboard({ date, setDate, navigate, open, notify }: Props) {
  const { data, demo, profile } = useStore(); const [period, setPeriod] = useState<AnalyticsPeriod>('week'); const [grouping, setGrouping] = useState<Grouping>('day'); const [exporting, setExporting] = useState(false);
  const { from, to } = analyticsRange(date, period);
  const sheets = activeSheets(data, date); const totals = summary(sheets);
  const previous = summary(activeSheets(data, shiftDate(date, -7)));
  const growth = (current: number, before: number) => before ? `${current >= before ? '+' : ''}${Math.round((current - before) / before * 100)} %` : undefined;
  const chartDays = useMemo(() => analyze(data, shiftDate(date, -6), date).daily.map(d => ({ ...d, previous: d.previousSales })), [data, date]);
  const max = Math.max(100000, ...chartDays.map(d => Math.max(d.sales, d.previous))) * 1.2;
  const lowStock = data.products.filter(p => p.stock <= p.threshold);
  const activeEmployees = data.employees.filter(e => e.status === 'active');
  const ranking = [...sheets].sort((a, b) => salesValue(b) - salesValue(a));
  const totalTaken = sheets.reduce((s, sheet) => s + receivedValue(sheet), 0);
  const rate = totalTaken ? (totals.shortage / totalTaken * 100).toFixed(1) : '0';
  const saveReport = async () => { setExporting(true); try { await exportReport(data, sheets, 'pdf', date); notify('Le rapport PDF a été téléchargé.'); } catch { notify('Le téléchargement a échoué. Réessayez.'); } finally { setExporting(false); } };
  return <>
    <div className="dashboard-heading"><div><div className="eyebrow">VOTRE BAR, EN UN REGARD</div><h1>Bonjour, {shortName(profile?.name || '')} <span className="greeting-dot">.</span></h1><p>Gardez un œil sur l’essentiel, où que vous soyez.</p></div><div className="page-actions"><Button variant="secondary" icon={Download} onClick={() => void saveReport()} disabled={exporting}>{exporting ? 'Export…' : 'Exporter'}</Button><Button icon={Plus} onClick={() => open({ type: 'sheet' })}>Nouvelle fiche</Button></div></div>
    <div className="overview-toolbar"><div className="overview-tabs"><span className="selected">Vue d’ensemble</span><button onClick={() => navigate('reports')}>Performance <ArrowUpRight size={13} /></button></div><div className="overview-date"><span className="live-label"><i />{demo ? 'Aperçu de démonstration' : 'Suivi en direct'}</span><label className="date-picker"><CalendarDays size={15} /><span>{date === today() ? "Aujourd’hui" : dateLabel(date, { day: 'numeric', month: 'short' })}<span className="date-long">, {dateLabel(date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span><ChevronDown size={14} /><input aria-label="Date du tableau de bord" type="date" max={today()} value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label></div></div>
    <div className="stats-grid">
      <Stat label="Ventes du jour" value={money(totals.sales)} icon={TrendingUp} change={growth(totals.sales, previous.sales)} note="vs le même jour à J−7" spark={chartDays.map(d => d.sales / max * 28)} />
      <Stat label="Cash encaissé" value={money(totals.cash)} icon={Banknote} color="blue" change={growth(totals.cash, previous.cash)} note="vs le même jour à J−7" spark={chartDays.map(d => d.cash / max * 28)} />
      <Stat label="Mobile Money" value={money(totals.momo)} icon={Smartphone} color="purple" change={growth(totals.momo, previous.momo)} note="vs le même jour à J−7" spark={chartDays.map(d => d.momo / max * 28)} />
      <Stat label="Manquants du jour" value={money(totals.shortage)} icon={Wallet} color="orange" note={`${sheets.filter(s => s.shortage > 0).length} serveuses concernées`} change={`${rate} % des remises`} />
    </div>
    <div className="analytics-toolbar">
      <div><h2>Votre activité en graphiques</h2><p>{dateLabel(from)}{from !== to ? ` — ${dateLabel(to)}` : ''}</p></div>
      <div className="segmented" role="group" aria-label="Période des graphiques">{Object.entries(periodLabels).map(([value, label]) => <button type="button" aria-pressed={period === value} className={period === value ? 'active' : ''} key={value} onClick={() => setPeriod(value as AnalyticsPeriod)}>{label}</button>)}</div>
    </div>
    <div className="analytics-lead">
      <SalesTrend data={data} from={from} to={to} grouping={grouping} onGrouping={setGrouping} />
      <PaymentDonut data={data} from={from} to={to} />
    </div>
    <div className="dashboard-bottom">
      <section className="panel team-performance"><SectionTitle title="L’équipe aujourd’hui" description={`${sheets.length} serveuses en service · ${activeEmployees.length - sheets.length > 0 ? activeEmployees.length - sheets.length : 0} sans fiche aujourd’hui`} action={<button className="text-button" onClick={() => navigate('team')}>Voir l’équipe <ArrowRight size={14} /></button>} />
        <div className="table-scroll"><table><thead><tr><th>Serveuse</th><th className="numeric">Ventes totales</th><th>Performance</th><th className="numeric">Manquant</th><th>Statut</th><th /></tr></thead><tbody>{ranking.slice(0, 5).map((s, i) => { const e = data.employees.find(e => e.id === s.employeeId)!; return <tr key={s.id}><td><div className="person-cell"><Avatar name={e.name} color={e.color} size="sm" /><div><strong>{e.name}</strong><small>{i === 0 ? 'Meilleure vente du jour' : `En service · ${shortName(e.name)}`}</small></div>{i === 0 && <span className="rank-star">✦</span>}</div></td><td className="numeric strong">{money(salesValue(s))} <span className="unit-inline">F</span></td><td><div className="performance-bar"><i style={{ width: `${salesValue(s) / Math.max(1, salesValue(ranking[0])) * 100}%` }} /></div></td><td className={`numeric ${s.shortage ? 'orange-text' : 'muted'}`}>{s.shortage ? `${money(s.shortage)} F` : '—'}</td><td><Badge tone={s.shortage ? 'orange' : 'green'} dot>{s.shortage ? 'À vérifier' : 'À jour'}</Badge></td><td><button className="icon-button" aria-label={`Voir la fiche de ${e.name}`} onClick={() => open({ type: 'sheet-detail', id: s.id })}><ArrowUpRight size={16} /></button></td></tr>; })}{!ranking.length && <tr><td colSpan={6} className="table-empty">Aucune fiche pour cette journée. Créez la première fiche.</td></tr>}</tbody></table></div><div className="table-footer"><span><Users size={14} />Une fiche par serveuse, un suivi plus clair.</span><button className="text-button" onClick={() => navigate('daily')}>Toutes les fiches <ArrowRight size={14} /></button></div>
      </section>
      <section className="panel attention-panel"><SectionTitle title="À votre attention" action={<span className="count-chip">{(lowStock.length ? 1 : 0) + (totals.shortage ? 1 : 0) + 1}</span>} />
        {!!lowStock.length && <button className="attention-item" onClick={() => navigate('stock')}><span className="attention-icon tint-orange"><Package size={18} /></span><div><strong>{lowStock.length} produits à réapprovisionner</strong><p>{lowStock.slice(0, 2).map(p => p.name).join(', ')}{lowStock.length > 2 ? '…' : ''}</p><span>Voir le stock <ArrowUpRight size={12} /></span></div></button>}
        {totals.shortage > 0 && <button className="attention-item" onClick={() => navigate('debts')}><span className="attention-icon tint-rose"><CircleAlert size={18} /></span><div><strong>{fcfa(totals.shortage)} de manquants</strong><p>Imputés aux serveuses concernées.</p><span>Consulter les détails <ArrowUpRight size={12} /></span></div></button>}
        <button className="attention-item" onClick={() => open({ type: 'closure' })}><span className="attention-icon tint-blue">{data.closures.some(c => c.date === date) ? <Check size={18} /> : <Clock3 size={18} />}</span><div><strong>{data.closures.some(c => c.date === date) ? 'Journée clôturée' : 'Clôture de la journée'}</strong><p>{data.closures.some(c => c.date === date) ? 'Toutes les fiches sont verrouillées.' : `À effectuer avant ${data.settings.closingTime.replace(':', ' h ')}.`}</p><span>{data.closures.some(c => c.date === date) ? 'Consulter' : 'Préparer la clôture'} <ArrowUpRight size={12} /></span></div></button>
        <div className="quiet-note"><span className="shield-check"><Check size={12} /></span>Chaque mouvement garde une trace.</div>
      </section>
    </div>
    <div className="analytics-section">
      <div className="analytics-toolbar"><div><h2>Comprendre les chiffres</h2><p>{dateLabel(from)}{from !== to ? ` — ${dateLabel(to)}` : ''} · fiches validées</p></div><button className="text-button" onClick={() => navigate('reports')}>Tous les graphiques <ArrowRight size={15} /></button></div>
      <AnalyticsPanels data={data} from={from} to={to} grouping={grouping} />
    </div>
    <div className="dashboard-footnote"><span><ClipboardList size={13} />{demo ? 'Données fictives · vos modifications sont conservées sur cet appareil' : 'Comptoir · votre activité, en toute clarté'}</span><span>{data.settings.location} <span className="tiny-dot" /> Heure du Bénin (UTC+1)</span></div>
  </>;
}
