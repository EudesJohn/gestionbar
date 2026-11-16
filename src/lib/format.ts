const numbers = new Intl.NumberFormat('fr-FR');
export const money = (value: number) => numbers.format(value);
export const fcfa = (value: number) => `${money(value)} FCFA`;
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
export const uid = () => crypto.randomUUID();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};
export const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', options);
export const monthLabel = (month: string) => dateLabel(`${month}-01`, { month: 'long', year: 'numeric' });
export const shortName = (name: string) => name.split(' ')[0];
