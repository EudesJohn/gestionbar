import { useEffect, useState } from 'react';
import { Bell, BookOpen, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, CloudCheck, LayoutDashboard, Menu, Package, Search, Settings, ShieldCheck, Smartphone, Store, Users, Wallet, Wine, X, WifiOff, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useStore } from './store';
import { Dashboard } from './components/Dashboard';
import { Forms } from './components/Forms';
import type { ModalState } from './components/Forms';
import { Pages } from './components/Pages';
import { Avatar, Badge, Button, ErrorMessage, Field, Input, Modal, SearchInput } from './components/ui';
import { today, fcfa } from './lib/format';
import type { Page } from './types';

const navigation = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'daily', label: 'Fiche du jour', icon: ClipboardList },
  { id: 'team', label: 'Personnel', icon: Users },
  { id: 'products', label: 'Catalogue produits', icon: Wine },
  { id: 'stock', label: 'Stock & inventaire', icon: Package },
  { id: 'debts', label: 'Dettes & manquants', icon: Wallet },
  { id: 'payroll', label: 'Salaires', icon: BookOpen },
  { id: 'reports', label: 'Rapports', icon: ChartNoAxesCombined },
] as const;
const roles = { admin: 'Administrateur', manager: 'Gérant', entry: 'Saisie' };
export function App() {
  const store = useStore(); const { data, profile, demo, loading, error, online, pending } = store;
  const [page, setPage] = useState<Page>('dashboard'); const [date, setDate] = useState(today);
  const [modal, setModal] = useState<ModalState | null>(null); const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState(''); const [search, setSearch] = useState(false); const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState(false); const [help, setHelp] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const notify = (text: string) => setToast(text);
  const navigate = (next: Page) => { setPage(next); setSidebar(false); setSearch(false); window.scrollTo(0, 0); };
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearch(v => !v); } if (e.key === 'Escape') setSidebar(false); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useEffect(() => { if (profile?.role === 'entry') setPage('daily'); }, [profile?.role]);
  if (loading) return <div className="loading-screen"><span className="brand-icon"><Wine size={30} /></span><h1>Comptoir<span>.</span></h1><p>Votre bar prend place…</p><span className="loader" /></div>;
  if (!profile) return <Login error={error} />;
  const currentLabel = page === 'settings' ? 'Paramètres' : navigation.find(n => n.id === page)?.label;
  const lowStock = data.products.filter(p => p.stock <= p.threshold);
  const visibleNavigation = navigation.filter(n => profile.role !== 'entry' || ['daily', 'products'].includes(n.id));
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Aller au contenu</a>
    {sidebar && <button className="sidebar-overlay" aria-label="Fermer le menu" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
      <button className="brand" onClick={() => navigate(profile.role === 'entry' ? 'daily' : 'dashboard')} aria-label="Comptoir, accueil"><span className="brand-icon"><Wine size={24} strokeWidth={1.8} /></span><span>comptoir<span className="brand-dot">.</span></span><span className="brand-caption">LA GESTION, AU CLAIR.</span></button>
      <button className="bar-switcher" onClick={() => { if (profile.role === 'admin') navigate('settings'); else setHelp(true); }}><span className="bar-icon"><Store size={19} /></span><span><strong>{data.settings.barName}</strong><small>{data.settings.location}</small></span><ChevronDown size={15} /></button>
      <div className="nav-label">VOTRE ESPACE</div>
      <nav aria-label="Navigation principale">{visibleNavigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7} /><span>{label}</span>{id === 'debts' && data.debts.some(d => d.balance > 0) && <span className="nav-count">{data.debts.filter(d => d.balance > 0).length}</span>}{page === id && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-support"><span><ShieldCheck size={19} /></span><strong>Proche de votre bar.<br />Même à distance.</strong><p>L’essentiel pour gérer<br />en toute sérénité.</p><button onClick={() => setHelp(true)}>Découvrir le guide <ArrowIcon /></button></div><div className="sidebar-secondary">{profile.role === 'admin' && <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={18} /><span>Paramètres</span></button>}<button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18} /><span>Aide & prise en main</span></button></div><div className="sidebar-version"><span className="tiny-dot" />Comptoir v1.0<span>Fait pour votre quotidien</span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Ouvrir le menu" onClick={() => setSidebar(true)}><Menu size={22} /></button><span className="breadcrumb-home">Espace de gestion</span><ChevronRight size={13} className="breadcrumb-home" /><strong>{currentLabel}</strong></div><div className="topbar-actions"><button className="global-search" onClick={() => setSearch(true)}><Search size={16} /><span>Rechercher…</span><kbd>⌘ K</kbd></button><span className={`connection-status ${!online ? 'offline' : ''}`}>{online ? <CloudCheck size={15} /> : <WifiOff size={15} />}<span>{demo ? 'Mode démo' : !online ? 'Hors connexion' : pending.length ? `${pending.length} en attente` : 'Connecté'}</span></span><button className="notification-button icon-button" aria-label="Voir les notifications" onClick={() => setNotifications(true)}><Bell size={19} /><i /></button><div className="topbar-divider" /><button className="profile-button" onClick={() => setModal({ type: 'account' })}><Avatar name={profile.name} color="#e8e5de" /><span><strong>{profile.name}</strong><small>{roles[profile.role]}</small></span><ChevronDown size={13} /></button></div></header>
      <main id="main-content" className="main-content">
        {error && <div className="status-banner error-banner"><CircleHelp size={17} /><span>{error}</span><button onClick={() => void store.sync()}>Réessayer</button></div>}
        {!online && <div className="status-banner"><WifiOff size={17} /><span>{demo ? 'Mode hors connexion : vos changements restent enregistrés sur cet appareil.' : 'Hors connexion : les nouvelles fiches sont conservées en attente de validation serveur.'}</span></div>}
        {!!pending.length && <div className="status-banner"><RefreshCw size={17} /><span>{pending.length} fiche(s) en attente. Les totaux affichent uniquement les fiches validées.</span><button onClick={() => setModal({ type: 'queue' })}>Vérifier</button></div>}
        {page === 'dashboard' ? <Dashboard date={date} setDate={setDate} navigate={navigate} open={setModal} notify={notify} /> : <Pages page={page} date={date} setDate={setDate} open={setModal} notify={notify} />}
      </main>
    </div>
    {modal && <Forms modal={modal} date={date} close={() => setModal(null)} open={setModal} notify={notify} />}
    {toast && <div className="toast" role="status"><span><Check size={17} /></span>{toast}<button aria-label="Fermer la notification" onClick={() => setToast('')}><X size={16} /></button></div>}
    {needRefresh && <div className="update-banner">Une nouvelle version est disponible.<Button onClick={() => void updateServiceWorker(true)}>Mettre à jour</Button></div>}
    {search && <Modal title="Retrouvez l’essentiel" description="Une serveuse, un produit ou un espace de travail." onClose={() => setSearch(false)}><div className="modal-body"><SearchInput value={query} onChange={setQuery} placeholder="Que recherchez-vous ?" /><div className="search-results">{visibleNavigation.filter(n => n.label.toLowerCase().includes(query.toLowerCase())).map(n => <button key={n.id} onClick={() => navigate(n.id)}><n.icon size={18} /><span>{n.label}<small>Espace de travail</small></span><ChevronRight size={15} /></button>)}{query && data.employees.filter(e => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5).map(e => <button key={e.id} onClick={() => { setSearch(false); setModal({ type: 'employee-detail', id: e.id }); }}><Avatar name={e.name} size="sm" color={e.color} /><span>{e.name}<small>Personnel</small></span><ChevronRight size={15} /></button>)}{query && data.products.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5).map(p => <button key={p.id} onClick={() => navigate('products')}><Wine size={18} /><span>{p.name}<small>{fcfa(p.price)} · {p.stock} en réserve</small></span><ChevronRight size={15} /></button>)}</div></div></Modal>}
    {notifications && <Modal title="Vos notifications" description="Les points à suivre pour votre établissement." onClose={() => setNotifications(false)}><div className="modal-body notification-list">{lowStock.map(p => <button key={p.id} onClick={() => { setNotifications(false); navigate('stock'); }}><span className="attention-icon tint-orange"><Package size={20} /></span><span><strong>Stock bas : {p.name}</strong><small>{p.stock} bouteilles restantes · seuil de {p.threshold}</small></span><ChevronRight size={16} /></button>)}{data.debts.filter(d => d.balance >= data.settings.shortageAlert).slice(0, 5).map(d => <button key={d.id} onClick={() => { setNotifications(false); navigate('debts'); }}><span className="attention-icon tint-rose"><Wallet size={20} /></span><span><strong>{data.employees.find(e => e.id === d.employeeId)?.name}</strong><small>{fcfa(d.balance)} à régulariser</small></span><ChevronRight size={16} /></button>)}<p className="muted">Ces alertes sont calculées à partir des données enregistrées.</p></div></Modal>}
    {help && <Modal title="Bienvenue chez Comptoir" description="Les bons gestes pour garder une gestion claire." onClose={() => setHelp(false)}><div className="modal-body guide"><div><span>01</span><section><h3>Préparez votre établissement</h3><p>Ajoutez vos serveuses, les prix de vos produits et le stock initial. Les montants de démonstration sont fictifs.</p></section></div><div><span>02</span><section><h3>Une fiche, chaque jour</h3><p>Enregistrez les produits reçus et vendus, le cash, le Momo et les dépenses. Les invendus restent rattachés à la serveuse.</p></section></div><div><span>03</span><section><h3>Régularisez puis clôturez</h3><p>Les manquants créent une dette. Un remboursement réduit son solde. Le salaire tient compte des dettes encore dues, dans la limite paramétrée.</p></section></div><div className="info-box"><Smartphone size={20} /><p>Sur Android, ouvrez le menu du navigateur puis « Installer l’application » pour garder Comptoir sur votre écran d’accueil.</p></div></div></Modal>}
  </div>;
}
function ArrowIcon() { return <ChevronRight size={14} />; }
function Login({ error: initialError }: { error: string }) {
  const { signIn } = useStore(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <div className="login-page"><div className="login-aside"><span className="brand-icon"><Wine size={36} /></span><h1>Votre bar.<br />Votre équipe.<br /><span>L’esprit tranquille.</span></h1><p>À Pobè comme à Cotonou, gardez le fil de votre activité avec Comptoir.</p><span className="login-footer">COMPT OIR · LA GESTION, AU CLAIR.</span></div><div className="login-content"><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await signIn(email, password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Badge>Votre espace de gestion</Badge><h2>Heureux de vous retrouver.</h2><p>Connectez-vous pour suivre votre établissement.</p><Field label="Adresse e-mail"><Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required placeholder="vous@exemple.com" /></Field><Field label="Mot de passe"><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Votre mot de passe" /></Field><ErrorMessage error={error || initialError} /><Button type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}<ChevronRight size={16} /></Button><p className="login-help">Votre compte est créé par l’administrateur de votre établissement.</p></form></div></div>;
}
