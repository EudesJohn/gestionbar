export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const SESSION_LIMIT_MS = 8 * 60 * 60 * 1000;
const METHODS = new Set(['password', 'totp', 'webauthn']);

// UI helper only. The signed JWT and auth.sessions are independently verified by PostgreSQL.
export function sessionDeadline(token: string): number {
  try {
    const value = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const timestamps = (value.amr || []).filter((method: { method: string; timestamp: number }) => METHODS.has(method.method) && Number.isFinite(method.timestamp)).map((method: { timestamp: number }) => method.timestamp * 1000);
    return timestamps.length ? Math.min(...timestamps) + SESSION_LIMIT_MS : 0;
  } catch { return 0; }
}

export function safeError(message: string): string {
  if (/MFA_REQUIRED/.test(message)) return 'Une double authentification est nécessaire pour continuer.';
  if (/SESSION_EXPIRED|SESSION_REVOKED/.test(message)) return 'Votre session a expiré. Reconnectez-vous.';
  if (/RATE_LIMITED/.test(message)) return 'Trop de demandes. Patientez avant de réessayer.';
  if (/PGRST|relation|schema cache|does not exist|permission denied|syntax error|violates|constraint/i.test(message)) return 'L’opération est indisponible. Vérifiez les données ou contactez l’administrateur.';
  return message;
}
