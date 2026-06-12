import { expect, test } from '@playwright/test';

/**
 * Root entry — the released web app boots and routes a fresh visitor.
 *
 * In LOCAL mode the app has no Clerk, so proxy.ts redirects `/` straight to the
 * seeded workspace (SEEDED_WORKSPACE_PATH = /default/default/workspace/overview)
 * rather than to /login. Landing there proves the Next.js server is up AND the
 * LOCAL-mode routing path is active.
 *
 * SCOPE: routing/liveness ONLY. That redirect target is a hardcoded constant in
 * proxy.ts — it does NOT consult the API/DB/seed, so this spec must not be read
 * as integration proof. The real proofs are api-integration.spec.ts (bootstrap)
 * and workspace-loads.spec.ts (seeded label in the live shell).
 */

const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';

test.describe('Released image — app entry', () => {
  test('GET / redirects into the seeded workspace, not login', async ({
    page,
  }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(
      response?.status() ?? 0,
      'root must not return an HTTP error',
    ).toBeLessThan(400);

    expect(page.url(), 'LOCAL mode must not redirect to login').not.toMatch(
      /\/login/,
    );
    expect(page.url(), 'root must land on the seeded workspace').toContain(
      SEEDED_WORKSPACE_PATH,
    );

    await expect(page.locator('body')).not.toBeEmpty();
  });
});
