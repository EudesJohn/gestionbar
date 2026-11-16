import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App';

const state = vi.hoisted(() => ({ loading: false, mfa: null as null | { needsEnrollment: boolean }, profile: null, error: '' }));
vi.mock('../src/store', () => ({ useStore: () => ({ ...state, data: {}, demo: false, online: true, pending: [] }) }));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [true, vi.fn()], updateServiceWorker: vi.fn() }) }));
vi.mock('../src/components/MfaScreen', () => ({ MfaScreen: () => <h1>Protégez votre compte</h1> }));

beforeEach(() => { state.loading = false; state.mfa = null; state.error = ''; });
describe('application updates before authentication', () => {
  it('offers the pending update while the user is stuck on login', () => {
    state.error = 'MFA_REQUIRED';
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Heureux de vous retrouver.');
    expect(html).toContain('Mettre à jour');
  });
  it('offers the pending update during MFA setup', () => {
    state.mfa = { needsEnrollment: true };
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Protégez votre compte');
    expect(html).toContain('Mettre à jour');
  });
  it('offers the pending update even while session loading is blocked', () => {
    state.loading = true;
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Votre bar prend place');
    expect(html).toContain('Mettre à jour');
  });
});
