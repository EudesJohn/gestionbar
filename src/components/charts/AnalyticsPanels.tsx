import { useMemo } from 'react';
import { TrendingUp, CalendarDays, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { Data } from '../../types';
import { analyze, chartColors as c, currentDebtDistribution, groupingLabels, percentage, stockCoverage } from '../../lib/analytics';
import type { Grouping } from '../../lib/analytics';
import { dateLabel, fcfa } from '../../lib/format';
import { ActivityCalendar, ChartCard, DonutChart, RankingChart, TimeChart } from './Charts';
import { Select } from '../ui';

export function SalesTrend({ data, from, to, grouping = 'day', onGrouping }: { data: Data; from: string; to: string; grouping?: Grouping; onGrouping?: (grouping: Grouping) => void }) {
  const a = useMemo(() => analyze(data, from, to, grouping), [data, from, to, grouping]);
  const change = a.previous.sales ? (a.totals.sales - a.previous.sales) / a.previous.sales * 100 : null;
  return <ChartCard title="Évolution des ventes" description="Comparez la période choisie à la période précédente de même durée." value={fcfa(a.totals.sales)}
    note={change === null ? 'Comparaison disponible dès la première période précédente.' : `${change >= 0 ? '+' : ''}${percentage(change)} par rapport à la période précédente`}
    action={onGrouping && <Select aria-label="Regrouper les graphiques" value={grouping} onChange={e => onGrouping(e.target.value as Grouping)}>{Object.entries(groupingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}>
    <TimeChart title="Courbe des ventes" points={a.sales} series={[{ label: 'Période choisie', color: c.green }, { label: 'Période précédente', color: c.muted, dashed: true }]} hasData={a.sheets.length > 0 || a.previous.sales > 0} />
    <p className="visual-footnote">Comparaison du {dateLabel(a.previousFrom)} au {dateLabel(a.previousTo)}. Les jours sans fiche sont affichés à zéro.</p>
  </ChartCard>;
}

export function PaymentDonut({ data, from, to }: { data: Data; from: string; to: string }) {
  const a = useMemo(() => analyze(data, from, to), [data, from, to]);
  return <ChartCard title="Répartition des encaissements" description="La part des espèces et du Mobile Money." value={fcfa(a.totals.cash + a.totals.momo)}>
    <DonutChart title="Répartition cash et Mobile Money" slices={[{ label: 'Cash', value: a.totals.cash, color: c.green }, { label: 'Mobile Money', value: a.totals.momo, color: c.gold }]} emptyText="Aucun encaissement enregistré sur cette période." />
    <p className="visual-footnote">Montants remis sur les fiches validées. Les remboursements de dettes ne sont pas de nouvelles ventes.</p>
  </ChartCard>;
}

export function AnalyticsPanels({ data, from, to, grouping = 'day', extended = false }: { data: Data; from: string; to: string; grouping?: Grouping; extended?: boolean }) {
  const a = useMemo(() => analyze(data, from, to, grouping), [data, from, to, grouping]);
  const debts = currentDebtDistribution(data);
  const debtLabels = { shortage: 'Manquants', credit: 'Crédits clients', advance: 'Avances', other: 'Autres retenues' };
  const colors = [c.orange, c.blue, c.purple, c.muted];
  return <>
    <div className="analytics-insights">
      <div><span className="insight-symbol"><CalendarDays size={18} /></span><span>Meilleur jour<strong>{a.bestDay ? dateLabel(a.bestDay.date, { weekday: 'short', day: 'numeric', month: 'short' }) : 'En attente de fiches'}</strong><small>{a.bestDay ? fcfa(a.bestDay.sales) : 'Sur la période sélectionnée'}</small></span></div>
      <div><span className="insight-symbol"><TrendingUp size={18} /></span><span>Moyenne par jour enregistré<strong>{fcfa(a.average)}</strong><small>{a.recordedDays} jour(s) avec au moins une fiche</small></span></div>
      <div><span className="insight-symbol"><Wallet size={18} /></span><span>Taux de marge brute<strong>{percentage(a.marginRate)}</strong><small>Hors charges fixes et salaires</small></span></div>
    </div>
    <div className="analytics-grid">
      <ChartCard title="Ventes par produit" description="Les six références qui contribuent le plus aux ventes.">
        <RankingChart title="Classement des produits" items={a.products.slice(0, 6).map(p => ({ label: p.name, value: p.sales, detail: `${p.units} bouteille(s) vendue(s) · marge brute ${fcfa(p.margin)}` }))} />
      </ChartCard>
      <ChartCard title="Ventes par serveuse" description="Classement de l’équipe sur la période sélectionnée.">
        <RankingChart title="Classement des serveuses" color={c.blue} items={a.employees.slice(0, 6).map(e => ({ label: e.name, value: e.sales, detail: `${e.days} jour(s) enregistré(s) · taux de manquants ${percentage(e.shortageRate)}` }))} />
      </ChartCard>
      <ChartCard title="Marge brute & dépenses" description="La marge des produits vendus et les dépenses justifiées." value={fcfa(a.margin)} note="Marge brute estimée avant dépenses et charges fixes">
        <TimeChart title="Courbe de marge et dépenses" points={a.margins} series={[{ label: 'Marge brute', color: c.green }, { label: 'Dépenses', color: c.purple }]} hasData={a.sheets.length > 0} />
        <p className="visual-footnote">Calcul avec les prix enregistrés sur chaque fiche. Ce montant n’est pas le bénéfice net du bar.</p>
      </ChartCard>
      <ChartCard title="Manquants & crédits clients" description="Repérez les écarts et les ventes à crédit de la période." value={fcfa(a.totals.shortage)} note="Manquants constatés sur les fiches sélectionnées">
        <TimeChart title="Courbe des manquants et crédits" points={a.gaps} series={[{ label: 'Manquants', color: c.orange }, { label: 'Crédits clients', color: c.blue }]} variant="line" hasData={a.sheets.length > 0} />
        <p className="visual-footnote">Montants à la validation des fiches, avant les remboursements ultérieurs.</p>
      </ChartCard>
      {extended && <>
        <ChartCard title="Cash & Momo au fil du temps" description="Comparez les deux modes de remise pour chaque période.">
          <TimeChart title="Histogramme des encaissements" points={a.payments} series={[{ label: 'Cash', color: c.green }, { label: 'Mobile Money', color: c.gold }]} variant="bars" hasData={a.sheets.length > 0} />
        </ChartCard>
        <ChartCard title="Activité des jours" description="L’intensité de la couleur représente les ventes du jour."><ActivityCalendar days={a.daily} /></ChartCard>
        <ChartCard title="Ventes par catégorie" description="La contribution des familles de boissons aux ventes.">
          <DonutChart title="Répartition des ventes par catégorie" slices={a.categories.map((category, i) => ({ ...category, color: [c.green, c.gold, c.blue, c.purple][i] }))} emptyText="Aucun produit vendu sur cette période." />
        </ChartCard>
      </>}
      <ChartCard title="Dettes encore dues" description="Situation actuelle, toutes dates confondues.">
        <DonutChart title="Répartition des dettes en cours" slices={debts.map((debt, i) => ({ label: debtLabels[debt.kind], value: debt.value, color: colors[i] }))} emptyText="Aucune dette restante. Tous les soldes sont à zéro." />
        <p className="visual-footnote">Les remboursements et les retenues sur salaire réduisent ces soldes.</p>
      </ChartCard>
      <ChartCard title="Réserve & seuils de stock" description="Les sept produits les plus proches de leur seuil, au stock actuel.">
        <RankingChart title="Stock actuel et seuils d’alerte" unit="bt." items={stockCoverage(data).map(p => ({ label: p.name, value: p.stock, threshold: p.threshold, color: p.stock <= p.threshold ? c.orange : c.green, detail: `Seuil : ${p.threshold} bouteilles · ${p.stock <= p.threshold ? 'à réapprovisionner' : 'stock disponible'}` }))} emptyText="Ajoutez des produits et un inventaire de départ pour suivre la réserve." />
        <p className="visual-footnote"><span className="threshold-key" />Le repère vertical indique le seuil d’alerte.</p>
      </ChartCard>
    </div>
  </>;
}

export function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="trend-neutral">Pas de comparaison disponible</span>;
  const change = (current - previous) / previous * 100; const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`trend-badge ${change < 0 ? 'negative' : ''}`}><Icon size={14} />{change > 0 ? '+' : ''}{percentage(change)} <small>vs période précédente</small></span>;
}
