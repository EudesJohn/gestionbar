import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { BarChart3, ChevronDown, MousePointer2 } from 'lucide-react';
import { fcfa, money, dateLabel } from '../../lib/format';
import { percentage, shortAmount } from '../../lib/analytics';
import type { ChartPoint, Series } from '../../lib/analytics';

export function ChartCard({ title, description, value, note, action, children, className = '' }: { title: string; description: string; value?: string; note?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return <section className={`panel visual-card ${className}`} aria-labelledby={id}>
    <div className="visual-heading"><div><h2 id={id}>{title}</h2><p>{description}</p></div>{action}</div>
    {value && <div className="visual-value">{value}{note && <small>{note}</small>}</div>}
    {children}
  </section>;
}
function NoChart({ text }: { text: string }) { return <div className="chart-empty"><BarChart3 size={28} strokeWidth={1.4} /><strong>Aucune donnée à afficher</strong><p>{text}</p></div>; }
function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(500);
  useEffect(() => {
    if (!ref.current) return;
    const update = () => setWidth(Math.max(200, Math.floor(ref.current!.getBoundingClientRect().width)));
    update(); const observer = new ResizeObserver(update); observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
function ChartNumbers({ title, points, series, format }: { title: string; points: ChartPoint[]; series: Series[]; format: (n: number) => string }) {
  return <details className="chart-numbers"><summary>Voir les chiffres<ChevronDown size={14} /></summary><div className="table-scroll"><table><caption className="sr-only">{title}</caption><thead><tr><th>Période</th>{series.map(s => <th key={s.label} className="numeric">{s.label}</th>)}</tr></thead><tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.detail || p.label}</th>{series.map((s, j) => <td className="numeric" key={s.label}>{format(p.values[j] || 0)}</td>)}</tr>)}</tbody></table></div></details>;
}

export function TimeChart({ title, points, series, variant = 'area', emptyText = 'Validez une fiche pour voir apparaître la courbe.', hasData = true, unit = 'FCFA' }: { title: string; points: ChartPoint[]; series: Series[]; variant?: 'area' | 'line' | 'bars'; emptyText?: string; hasData?: boolean; unit?: string }) {
  const { ref, width } = usePlotWidth(); const id = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null); const [hidden, setHidden] = useState<string[]>([]);
  const shown = series.map((s, index) => ({ ...s, index })).filter(s => !hidden.includes(s.label));
  const values = points.flatMap(p => shown.map(s => p.values[s.index] || 0));
  const low = Math.min(0, ...values); const high = Math.max(1, ...values);
  const padding = (high - low) * .12; const minimum = low < 0 ? low - padding : 0; const maximum = high + padding;
  const height = 228; const left = width < 360 ? 40 : 48; const right = 14; const top = 19; const bottom = 36;
  const plotHeight = height - top - bottom; const plotWidth = width - left - right;
  const x = (index: number) => variant === 'bars' ? left + (index + .5) * plotWidth / Math.max(1, points.length) : points.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (points.length - 1);
  const y = (value: number) => top + (maximum - value) / (maximum - minimum) * plotHeight;
  const index = active === null ? null : Math.min(active, points.length - 1);
  const selected = index === null ? null : points[index];
  const format = (value: number) => unit === 'FCFA' ? fcfa(value) : `${money(value)} ${unit}`;
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!points.length) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setActive(i => Math.max(0, Math.min(points.length - 1, (i ?? -1) + (event.key === 'ArrowRight' ? 1 : -1)))); }
    if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    if (event.key === 'End') { event.preventDefault(); setActive(points.length - 1); }
    if (event.key === 'Escape') setActive(null);
  };
  const toggle = (label: string) => { if (!hidden.includes(label) && shown.length === 1) return; setHidden(h => h.includes(label) ? h.filter(x => x !== label) : [...h, label]); };
  const maxLabels = Math.max(2, Math.floor(plotWidth / (points.some(p => p.label.length > 10) ? 112 : 76)));
  const labelIndices = new Set(Array.from({ length: Math.min(maxLabels, points.length) }, (_, i) => Math.round(i * (points.length - 1) / Math.max(1, Math.min(maxLabels, points.length) - 1))));
  const pointAt = (clientX: number, rect: DOMRect) => {
    const offset = (clientX - rect.left - left) / plotWidth;
    return Math.max(0, Math.min(points.length - 1, variant === 'bars' ? Math.floor(offset * points.length) : Math.round(offset * (points.length - 1))));
  };
  return <>
    <div className="visual-legend">{series.map(s => <button type="button" key={s.label} aria-pressed={!hidden.includes(s.label)} onClick={() => toggle(s.label)}><i style={{ background: s.color }} className={s.dashed ? 'dashed-dot' : ''} />{s.label}</button>)}</div>
    <div className="visual-plot" ref={ref}>
      {!hasData || !points.length ? <NoChart text={emptyText} /> : <div tabIndex={0} role="group" aria-label={`${title}. Utilisez les flèches gauche et droite pour consulter les valeurs.`} onKeyDown={keyboard} onBlur={() => setActive(null)} onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
        onPointerMove={e => { if (e.pointerType === 'mouse') setActive(pointAt(e.clientX, e.currentTarget.getBoundingClientRect())); }}
        onPointerDown={e => setActive(pointAt(e.clientX, e.currentTarget.getBoundingClientRect()))}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={title}>
          <defs>{shown.map(s => <linearGradient id={`${id}-${s.index}`} key={s.index} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".2" /><stop offset="100%" stopColor={s.color} stopOpacity=".015" /></linearGradient>)}</defs>
          {[0, 1, 2, 3, 4].map(i => { const value = minimum + (maximum - minimum) * i / 4; const yy = y(value); return <g key={i}><line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e5ebe6" strokeDasharray="3 4" /><text x={left - 8} y={yy + 4} textAnchor="end" fill="#67766c" fontSize="10">{shortAmount(value)}</text></g>; })}
          {low < 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="#a0afa4" strokeWidth="1" />}
          {variant === 'bars' ? points.map((point, i) => { const groupWidth = Math.min(58, plotWidth / points.length * .8); const slot = groupWidth / shown.length; const barWidth = slot * .8; return <g key={i}>{shown.map((s, j) => { const value = point.values[s.index] || 0; return <rect key={s.index} x={x(i) - groupWidth / 2 + j * slot} y={Math.min(y(0), y(value))} width={barWidth} height={Math.max(0, Math.abs(y(value) - y(0)))} rx={Math.min(3, barWidth / 2)} fill={s.color} opacity={index === null || index === i ? .9 : .5} />; })}</g>; }) : shown.map(s => {
            const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.values[s.index] || 0)}`).join(' ');
            return <g key={s.index}>{variant === 'area' && !s.dashed && <path d={`${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-${s.index})`} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.6} strokeDasharray={s.dashed ? '5 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {points.length === 1 && <circle cx={x(0)} cy={y(points[0].values[s.index] || 0)} r="4" fill={s.color} />}
            </g>;
          })}
          {points.map((point, i) => labelIndices.has(i) && <text key={i} x={x(i)} y={height - 12} textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'} fill="#65756a" fontSize="10">{point.label}</text>)}
          {index !== null && selected && <g><line x1={x(index)} x2={x(index)} y1={top} y2={height - bottom} stroke="#9aaa9f" strokeDasharray="3 3" />{shown.map(s => <circle key={s.index} cx={x(index)} cy={y(selected.values[s.index] || 0)} r="4.5" fill={s.color} stroke="white" strokeWidth="2" />)}</g>}
        </svg>
      </div>}
    </div>
    {hasData && !!points.length && <div className="chart-readout" aria-live="polite">{selected ? <><strong>{selected.detail}</strong><div>{shown.map(s => <span key={s.index}><i style={{ background: s.color }} />{s.label}<b>{format(selected.values[s.index] || 0)}</b></span>)}</div></> : <span className="chart-hint"><MousePointer2 size={13} />Touchez la courbe ou utilisez les flèches pour voir les montants.</span>}</div>}
    <ChartNumbers title={title} points={points} series={series} format={format} />
  </>;
}

export interface Slice { label: string; value: number; color: string }
export function DonutChart({ title, slices, emptyText, centerLabel = 'FCFA' }: { title: string; slices: Slice[]; emptyText: string; centerLabel?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0); const circumference = 2 * Math.PI * 66;
  const active = slices.find(s => s.label === selected); let consumed = 0;
  if (!total) return <NoChart text={emptyText} />;
  return <div className="donut-content">
    <div className="donut-visual"><svg viewBox="0 0 180 180" role="img" aria-label={`${title} : ${fcfa(total)}`}>
      <circle cx="90" cy="90" r="66" stroke="#eef2ed" strokeWidth="20" fill="none" />
      {slices.filter(s => s.value > 0).map(slice => {
        const length = slice.value / total * circumference; const offset = consumed; consumed += length;
        return <circle key={slice.label} cx="90" cy="90" r="66" fill="none" stroke={slice.color} strokeWidth={selected === slice.label ? 25 : 20}
          strokeDasharray={`${Math.max(0, length - (length < circumference ? 3 : 0))} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)"
          opacity={!selected || selected === slice.label ? 1 : .4} onPointerEnter={e => { if (e.pointerType === 'mouse') setSelected(slice.label); }} onPointerLeave={e => { if (e.pointerType === 'mouse') setSelected(null); }} onClick={() => setSelected(slice.label)}><title>{slice.label} : {fcfa(slice.value)} ({percentage(slice.value / total * 100)})</title></circle>;
      })}
    </svg><div className="donut-center"><span>{active ? active.label : 'Total'}</span><strong>{money(active?.value ?? total)}</strong><small>{centerLabel}</small></div></div>
    <div className="donut-key">{slices.map(slice => <button type="button" key={slice.label} aria-pressed={selected === slice.label} onClick={() => setSelected(slice.label)} onFocus={() => setSelected(slice.label)} onBlur={() => setSelected(null)}>
      <i style={{ background: slice.color }} /><span>{slice.label}<small>{percentage(slice.value / total * 100)}</small></span><strong>{money(slice.value)} <small>F</small></strong>
    </button>)}</div>
  </div>;
}

export interface RankedValue { label: string; value: number; detail?: string; color?: string; threshold?: number }
export function RankingChart({ title, items, unit = 'FCFA', color = '#267052', emptyText = 'Aucune vente enregistrée sur cette période.' }: { title: string; items: RankedValue[]; unit?: string; color?: string; emptyText?: string }) {
  const max = Math.max(1, ...items.flatMap(i => [i.value, i.threshold || 0]));
  if (!items.length) return <NoChart text={emptyText} />;
  return <div className="ranking-chart" role="list" aria-label={title}>
    {items.map((item, index) => <div className="ranking-chart-row" role="listitem" key={item.label + index}>
      <div className="ranking-chart-label"><span><b>{index + 1}</b>{item.label}</span><strong>{unit === 'FCFA' ? fcfa(item.value) : `${money(item.value)} ${unit}`}</strong></div>
      <div className="ranking-chart-track" aria-hidden="true"><i style={{ width: `${Math.max(0, item.value) / max * 100}%`, background: item.color || color }} />{item.threshold !== undefined && <span className="stock-threshold" style={{ left: `${item.threshold / max * 100}%` }} />}</div>
      {item.detail && <small>{item.detail}</small>}
    </div>)}
  </div>;
}

export function ActivityCalendar({ days }: { days: { date: string; sales: number; records: number }[] }) {
  const [selected, setSelected] = useState<string | null>(null); const max = Math.max(1, ...days.map(d => d.sales));
  const offset = days[0] ? (new Date(`${days[0].date}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const active = days.find(d => d.date === selected);
  return <div className="activity-calendar"><div className="activity-days">{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="activity-cells">{Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}{days.map(day => {
      const level = !day.records ? 0 : day.sales === 0 ? 1 : Math.max(1, Math.ceil(day.sales / max * 4));
      const label = `${dateLabel(day.date)} : ${day.records ? `${fcfa(day.sales)}, ${day.records} fiche(s)` : 'aucune fiche'}`;
      return <button key={day.date} type="button" className={`activity-cell activity-level-${level}`} aria-label={label} title={label} aria-pressed={selected === day.date} onFocus={() => setSelected(day.date)} onClick={() => setSelected(day.date)} onPointerEnter={e => { if (e.pointerType === 'mouse') setSelected(day.date); }}>{Number(day.date.slice(8))}{(day.date.slice(8) === '01' || day.date === days[0].date) && <small>{dateLabel(day.date, { month: 'short' })}</small>}</button>;
    })}</div>
    <div className="activity-scale"><span>Aucune fiche</span>{[0, 1, 2, 3, 4].map(n => <i key={n} className={`activity-level-${n}`} />)}<span>Ventes élevées</span></div>
    <div className="activity-readout" aria-live="polite">{active ? <><strong>{dateLabel(active.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><span>{active.records ? `${fcfa(active.sales)} · ${active.records} fiche(s)` : 'Aucune fiche enregistrée'}</span></> : <span>Sélectionnez un jour pour consulter son activité.</span>}</div>
  </div>;
}
