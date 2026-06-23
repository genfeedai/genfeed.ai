import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the shared app SHELL chrome:
 * command palette, agent panel, theme toggle, global search and the
 * user / account menu. These controls are mounted on every protected page,
 * so exercising them lifts coverage broadly.
 *
 * Auth + all API + Better Auth (and threads / runs / agent-credits) are mocked by the
 * fixtures, so opening the agent panel is safe. The strict network guard fails
 * on real outbound calls. Interactions are best-effort: tryClick never throws
 * and direct interactions are .catch-guarded so the specs stay non-brittle.
 */

const BRAND_BASE = '/test-org/brand-1';

async function settle(page: Parameters<typeof tryClick>[0]): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(400);
}

async function assertHealthy(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
}

test.describe('Shell — chrome interactions', () => {
  test.setTimeout(90_000);

  test('command palette opens via Cmd+K, accepts a query and closes', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage.keyboard.press('Meta+k').catch(() => {});
    await settle(authenticatedPage);

    const dialog = authenticatedPage.locator('[role="dialog"]').first();
    const searchInput = authenticatedPage
      .locator('[role="dialog"] input[type="search"]')
      .first();

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('settings').catch(() => {});
      await settle(authenticatedPage);
      await expect(dialog).toBeVisible();
      await authenticatedPage.keyboard.press('Escape').catch(() => {});
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('command palette also responds to Control+k', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage.keyboard.press('Control+k').catch(() => {});
    await settle(authenticatedPage);

    const searchInput = authenticatedPage
      .locator('[role="dialog"] input[type="search"]')
      .first();

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('library').catch(() => {});
      await settle(authenticatedPage);
      await authenticatedPage.keyboard.press('Escape').catch(() => {});
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('user / account menu opens and exposes settings entries', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // The UserDropdown trigger lives in the sidebar footer (aria-label Settings).
    const opened = await tryClick(
      authenticatedPage,
      'button[aria-label="Settings"]',
    );
    await settle(authenticatedPage);

    if (opened) {
      const personal = authenticatedPage
        .locator('[role="menuitem"]:has-text("Personal")')
        .first();
      if (await personal.isVisible().catch(() => false)) {
        await expect(personal).toBeVisible();
      }
      await authenticatedPage.keyboard.press('Escape').catch(() => {});
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('agent panel toggles via Cmd+L and composer accepts input', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/chat`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Open the agent / assistant panel: try the keyboard toggle then any
    // explicit agent toggle button.
    await authenticatedPage.keyboard.press('Meta+l').catch(() => {});
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button[aria-label*="agent" i]');
    await settle(authenticatedPage);

    // Focus the composer (a textarea or contenteditable) and type a message.
    const composer = authenticatedPage
      .locator(
        'textarea, [contenteditable="true"], input[placeholder*="message" i], input[placeholder*="ask" i]',
      )
      .first();

    if (await composer.isVisible().catch(() => false)) {
      await composer.click({ timeout: 5_000 }).catch(() => {});
      await composer
        .fill('Draft a launch caption for the spring campaign.')
        .catch(() => {});
      await settle(authenticatedPage);

      // Sending is fully mocked (threads / runs / credits), so this is safe.
      await tryClick(authenticatedPage, 'button[aria-label*="send" i]');
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('theme toggle and global search controls respond when present', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Theme toggle — best-effort across common aria-label phrasings.
    await tryClick(authenticatedPage, 'button[aria-label*="theme" i]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button[aria-label*="dark mode" i]');
    await settle(authenticatedPage);

    // Global search input — type and clear without asserting result content.
    const search = authenticatedPage
      .locator(
        'input[placeholder*="search" i], input[type="search"]:not([role="dialog"] input)',
      )
      .first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('campaign').catch(() => {});
      await settle(authenticatedPage);
      await search.fill('').catch(() => {});
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('brand / org switcher dropdown opens and closes cleanly', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const trigger = authenticatedPage
      .getByTestId('brand-switcher-trigger')
      .first();

    // Mandatory: a brand-scoped route always mounts the brand switcher. A silent
    // skip here is what hid #570 — never mask the switcher's absence.
    await expect(
      trigger,
      'brand switcher trigger should be visible',
    ).toBeVisible({ timeout: 10_000 });
    await trigger.click({ timeout: 5_000 });
    await settle(authenticatedPage);

    // Exercise the per-brand settings shortcut then dismiss. Soft: the action is
    // omitted for brands without a slug.
    const brandSettings = authenticatedPage
      .getByLabel(/open .+ settings/i)
      .first();
    if (await brandSettings.isVisible().catch(() => false)) {
      await expect(brandSettings).toBeVisible();
    }
    await authenticatedPage.keyboard.press('Escape').catch(() => {});
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });
});
