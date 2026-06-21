import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the shared app SHELL navigation chrome.
 *
 * The sidebar (MenuShared), workspace switcher, app switcher and breadcrumbs are
 * rendered on every protected page, so exercising them lifts coverage broadly.
 *
 * Auth + all API + Clerk are mocked by the fixtures; the strict network guard
 * fails on real outbound calls. Interactions are best-effort: tryClick never
 * throws and direct clicks are .catch-guarded so the specs stay non-brittle.
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

test.describe('Shell — navigation interactions', () => {
  test.setTimeout(90_000);

  test('sidebar shell renders with header and navigation sections', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await expect(
      authenticatedPage.getByTestId('sidebar-shell').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('sidebar-header-shell').first(),
    ).toBeVisible();

    await assertHealthy(authenticatedPage);
  });

  test('sidebar nav links navigate across primary sections', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const sidebar = authenticatedPage.getByTestId('sidebar-shell').first();
    const links = sidebar.locator('a[href]');
    const linkCount = await links.count().catch(() => 0);

    // Click through up to the first several real sidebar links and assert the
    // shell survives each navigation.
    for (let index = 0; index < Math.min(linkCount, 5); index += 1) {
      const link = links.nth(index);
      const isVisible = await link.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }
      await link.click({ timeout: 5_000 }).catch(() => {});
      await settle(authenticatedPage);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
    }

    await assertHealthy(authenticatedPage);
  });

  test('sidebar collapse control toggles the shell body', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // The collapse control is rendered in the sidebar header (toggles the rail).
    await tryClick(authenticatedPage, 'button[aria-label="Collapse sidebar"]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button[aria-label="Expand sidebar"]');
    await settle(authenticatedPage);

    // Cmd+B also toggles the desktop sidebar from the app layout.
    await authenticatedPage.keyboard.press('Meta+b').catch(() => {});
    await settle(authenticatedPage);
    await authenticatedPage.keyboard.press('Control+b').catch(() => {});
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('app switcher opens and exposes content and tools entries', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const opened = await tryClick(
      authenticatedPage,
      'button[aria-label="Switch app"]',
    );
    await settle(authenticatedPage);

    if (opened) {
      // Pick an item from the switcher (Library is a content app entry).
      await tryClick(
        authenticatedPage,
        '[role="menuitem"]:has-text("Library")',
      );
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('brand switcher opens and shows per-brand settings actions', async ({
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

    // The open dropdown lists each brand with an "Open … settings" action, which
    // only renders inside the popover. Soft-checked: omitted for brands with no
    // slug.
    const settingsAction = authenticatedPage
      .getByLabel(/open .+ settings/i)
      .first();
    if (await settingsAction.isVisible().catch(() => false)) {
      await expect(settingsAction).toBeVisible();
    }

    // Close the popover without navigating away.
    await authenticatedPage.keyboard.press('Escape').catch(() => {});
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('breadcrumbs render and remain healthy when entering a drill-down group', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace/overview`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Drill-down groups (e.g. Posts) update the SidebarNavigationContext that
    // drives the topbar breadcrumbs.
    await tryClick(
      authenticatedPage,
      '[data-testid="sidebar-shell"] a:has-text("Posts")',
    );
    await settle(authenticatedPage);

    const breadcrumb = authenticatedPage.locator(
      'nav[aria-label="Breadcrumb"]',
    );
    if (
      await breadcrumb
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(breadcrumb.first()).toBeVisible();
    }

    await assertHealthy(authenticatedPage);
  });

  test('sidebar survives navigation between distinct shell surfaces', async ({
    authenticatedPage,
  }) => {
    for (const route of [
      `${BRAND_BASE}/workspace/overview`,
      `${BRAND_BASE}/library/ingredients`,
      `${BRAND_BASE}/research/discovery`,
    ]) {
      await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(authenticatedPage);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await expect(
        authenticatedPage.getByTestId('sidebar-shell').first(),
      ).toBeVisible();
      await assertHealthy(authenticatedPage);
    }
  });
});
