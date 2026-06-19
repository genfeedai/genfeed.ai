import { expect, test } from '@playwright/test';

/**
 * Frontend ↔ API integration — the workspace shell renders SEEDED data.
 *
 * This is deliberately stronger than "Next served HTML". The overview server
 * loader swallows API failures into empty UI (overview-page-data.server.ts), so
 * a shell-only assertion would go green even with the API down. Instead we bind
 * to the protected layout's bootstrap result: the workspace switcher trigger
 * only shows the seeded label ("Default Workspace" / "Default Brand") once
 * AuthBootstrapService returned the seeded org/brand. So requiring that label
 * proves the web app fetched live data from the real API.
 */

const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';

test.describe('Released image — workspace shell', () => {
  test('seeded workspace renders with live brand/org data', async ({
    page,
  }) => {
    const response = await page.goto(SEEDED_WORKSPACE_PATH, {
      waitUntil: 'domcontentloaded',
    });

    expect(
      response?.status() ?? 0,
      'workspace must not return an HTTP error',
    ).toBeLessThan(400);

    // Middleware accepted the seeded slugs — no auth bounce.
    expect(page.url(), 'must not redirect to login').not.toMatch(/\/login/);
    expect(page.url(), 'must not redirect to onboarding').not.toMatch(
      /\/onboarding/,
    );

    // No framework error overlay.
    await expect(
      page.locator('[data-nextjs-dialog]'),
      'workspace rendered a framework error overlay',
    ).toHaveCount(0);

    // Shell chrome mounted (protected layout resolved).
    const switcher = page
      .getByTestId('desktop-sidebar-rail')
      .getByTestId('workspace-switcher-trigger');
    await expect(switcher, 'workspace switcher must mount').toBeVisible({
      timeout: 30_000,
    });

    // Seed-bound: the switcher label is the seeded "Default …" workspace/brand,
    // which only appears when bootstrap returned the seeded org/brand from the
    // live API. This is the assertion that proves real integration.
    await expect(
      switcher,
      'switcher must show the seeded "Default" workspace label',
    ).toContainText(/default/i, { timeout: 30_000 });
  });
});
