import { test, expect } from '@playwright/test';

test('logout destroys the cached snapshot and key while queued work remains encrypted and recoverable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bonjour, Eudes' })).toBeVisible();
  const result = await page.evaluate(async () => {
    // Exercise the real browser IndexedDB/WebCrypto boundary using only synthetic records.
    const storage = await import('/src/lib/private-storage.ts' as string);
    const owner = 'vault-test-owner'; const password = 'long-test-password-not-a-real-account';
    const queued = { id: 'vault-test-command', command: { type: 'day.close', payload: { date: '2026-11-16', note: 'confidential-test-note' } }, createdAt: '2026-11-16T12:00:00Z' };
    await storage.unlockVault(owner, password);
    await storage.saveSnapshot(owner, { data: { secret: 'confidential-test-salary' }, profile: { id: owner, name: 'Test', role: 'manager' }, profiles: [] });
    await storage.addQueue(owner, queued);
    const recoveredBefore = await storage.listQueue(owner);
    await storage.lockVault(owner);
    const raw = await new Promise<{ outbox: unknown[]; snapshots: unknown[] }>((resolve, reject) => {
      const request = indexedDB.open('comptoir-v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result; const transaction = database.transaction(['outbox', 'snapshots'], 'readonly');
        const queue = transaction.objectStore('outbox').getAll(); const cache = transaction.objectStore('snapshots').getAll();
        transaction.oncomplete = () => { resolve({ outbox: queue.result, snapshots: cache.result }); database.close(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const locked = !storage.isVaultUnlocked(owner);
    let wrongPasswordBlocked = false;
    try { await storage.unlockVault(owner, 'incorrect-test-password'); } catch { wrongPasswordBlocked = true; }
    await storage.unlockVault(owner, password);
    const recoveredAfter = await storage.listQueue(owner);
    await storage.deleteQueue(owner, queued.id); await storage.lockVault(owner);
    return { recoveredBefore, recoveredAfter, raw, locked, wrongPasswordBlocked };
  });
  expect(result.locked).toBe(true);
  expect(result.wrongPasswordBlocked).toBe(true);
  expect(result.recoveredAfter).toEqual(result.recoveredBefore);
  expect(result.recoveredAfter).toHaveLength(1);
  expect(result.raw.snapshots).toHaveLength(0);
  expect(result.raw.outbox).toHaveLength(1);
  expect(JSON.stringify(result.raw)).not.toContain('confidential-test-note');
  expect(JSON.stringify(result.raw)).not.toContain('confidential-test-salary');
});
