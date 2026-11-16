/* One-time recovery for installations whose old login screen hid the update prompt.
 * It changes only the app-shell worker. IndexedDB, queued sheets and Auth data are
 * untouched. Further releases retain the normal user-confirmed update flow.
 */
const authUpgradeCache = 'comptoir-auth-screen-upgrade-v1';
const authUpgradeMarker = new URL('__auth_screen_upgraded__', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(authUpgradeCache);
    const recovered = await cache.match(authUpgradeMarker);
    if (!recovered) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(authUpgradeCache);
    await cache.put(authUpgradeMarker, new Response('1'));
  })());
});
