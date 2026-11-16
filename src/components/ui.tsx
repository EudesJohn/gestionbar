import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import type { ReactElement, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { X, ArrowUpRight, LoaderCircle, Search, Inbox, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { initials } from '../lib/format';

export function Button({ children, variant = 'primary', icon: Icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: LucideIcon }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={16} strokeWidth={1.8} />}{children}</button>;
}
export function Badge({ children, tone = 'green', dot = false }: { children: ReactNode; tone?: 'green' | 'orange' | 'red' | 'gray' | 'blue'; dot?: boolean }) { return <span className={`badge badge-${tone}`}>{dot && <i />}{children}</span>; }
export function Avatar({ name, color = '#dbe8df', size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) { return <span className={`avatar avatar-${size}`} style={{ backgroundColor: color }}>{initials(name)}</span>; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-labelledby'?: string; 'aria-describedby'?: string }>, { id, 'aria-labelledby': `${id}-label`, 'aria-describedby': hint ? `${id}-hint` : undefined }) : children;
  return <div className="field"><label className="field-label" htmlFor={id} id={`${id}-label`}>{label}</label>{control}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} />; }
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <span className="select-wrap"><select className="input" {...props}>{children}</select><ChevronDown size={15} /></span>; }
export function SearchInput({ value, onChange, placeholder = 'Rechercher…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="search-field"><Search size={17} /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />{value && <button aria-label="Effacer la recherche" onClick={() => onChange('')}><X size={15} /></button>}</div>; }
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) { return <div className="empty"><span className="empty-icon"><Inbox size={28} /></span><h3>{title}</h3><p>{text}</p>{children}</div>; }
export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="section-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>; }
export function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) { return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>; }
export function Stat({ label, value, unit = 'FCFA', change, note, icon: Icon, color = 'green', spark }: { label: string; value: string; unit?: string; change?: string; note?: string; icon: LucideIcon; color?: string; spark?: number[] }) {
  return <div className={`stat-card stat-${color}`}><div className="stat-top"><span>{label}</span><span className={`stat-icon tint-${color}`}><Icon size={18} strokeWidth={1.7} /></span></div><div className="stat-value">{value}<span>{unit}</span></div><div className="stat-bottom"><span>{change && <b className={`change ${color === 'orange' ? 'warn' : ''}`}><ArrowUpRight size={13} />{change}</b>}{note && <small>{note}</small>}</span>{spark && <svg viewBox="0 0 90 28" className="sparkline" aria-hidden="true"><path d={`M ${spark.map((x, i) => `${i * 90 / Math.max(1, spark.length - 1)},${28 - x}`).join(' L ')}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div></div>;
}
export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { dialog?.close(); document.body.style.overflow = old; }; }, []);
  return <dialog ref={ref} aria-labelledby={id} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}><div className="modal-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
export function FormFooter({ busy, onClose, label = 'Enregistrer' }: { busy: boolean; onClose: () => void; label?: string }) { return <div className="form-footer"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button><Button type="submit" disabled={busy} icon={busy ? LoaderCircle : undefined}>{busy ? 'Enregistrement…' : label}</Button></div>; }
export function ErrorMessage({ error }: { error: string }) { return error ? <div className="form-error" role="alert">{error}</div> : null; }
