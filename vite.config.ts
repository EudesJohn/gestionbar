import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (Boolean(url) !== Boolean(key)) throw new Error('Configurez ensemble VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
  if (process.env.VERCEL_ENV === 'production' && (!url || !key)) throw new Error('Les variables publiques Supabase sont requises pour le déploiement de production.');
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('L’URL Supabase doit être celle du projet HTTPS.');
  if (key) {
    let publicKey = key.startsWith('sb_publishable_');
    if (key.startsWith('eyJ')) {
      try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; }
      catch { publicKey = false; }
    }
    if (!publicKey) throw new Error('Clé Supabase refusée : utilisez une clé anon ou publishable, jamais une clé service_role ou secret dans VITE_*.');
  }
  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Comptoir — Gestion de bar',
        short_name: 'Comptoir',
        description: 'Votre bar en un regard.',
        lang: 'fr',
        theme_color: '#143d32',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], maximumFileSizeToCacheInBytes: 4000000 },
    }),
  ],
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
  };
});
