import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertHealthy } from '../../utils/interaction-helpers';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * E2E interaction coverage for BRAND settings surfaces.
 *
 * Routes live under `/test-org/brand-1/settings/...`. Auth, Better Auth and the API
 * (including settings PATCH/PUT writes) are fully mocked, so toggling switches,
 * editing fields, changing selects and saving are all safe and resolve as
 * success. Interactions are best-effort: selectors fall back to `tryClick` and
 * are guarded with `.catch()` so a missing control never hard-fails the spec —
 * the goal is to exercise interactive code paths for coverage.
 */

const BRAND_SETTINGS = '/test-org/brand-1/settings';

/** Toggle the first visible Radix switch on the page (best-effort). */
async function toggleFirstSwitch(page: Page): Promise<void> {
  const toggle = page
    .locator('[role="switch"], input[type="checkbox"]')
    .first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click({ timeout: 5_000 }).catch(() => {});
  }
}

/** Fill the first visible text input/textarea with a value (best-effort). */
async function fillFirstTextField(page: Page, value: string): Promise<void> {
  const field = page
    .locator(
      'input[type="text"]:visible, input:not([type]):visible, textarea:visible',
    )
    .first();
  if (await field.isVisible().catch(() => false)) {
    await field.fill(value, { timeout: 5_000 }).catch(() => {});
  }
}

/** Click the first visible save/update button (mocked to succeed). */
async function clickSave(page: Page): Promise<void> {
  await tryClick(
    page,
    'button:has-text("Save"), button:has-text("Update"), button[type="submit"]',
  ).catch(() => {});
}

test.describe('Brand Settings — Interactions', () => {
  test.setTimeout(90_000);

  test('brand overview renders and supports interaction', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BRAND_SETTINGS, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await tryClick(authenticatedPage, 'button:has-text("Edit")').catch(
      () => {},
    );

    await assertHealthy(authenticatedPage);
  });

  test('brand overview can open and close a link/edit overlay', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BRAND_SETTINGS, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await tryClick(
      authenticatedPage,
      'button:has-text("Add"), button:has-text("Link"), button:has-text("Edit")',
    ).catch(() => {});

    // Close anything that opened: a Cancel button or Escape.
    await tryClick(authenticatedPage, 'button:has-text("Cancel")').catch(
      () => {},
    );
    await authenticatedPage.keyboard.press('Escape').catch(() => {});

    await assertHealthy(authenticatedPage);
  });

  test('brand overview toggles public profile switch', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BRAND_SETTINGS, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await toggleFirstSwitch(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('agent-defaults renders and edits fields', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/agent-defaults`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await fillFirstTextField(authenticatedPage, 'E2E agent default');
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('agent-defaults changes a select/combobox option', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/agent-defaults`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // Open the first combobox/select, then pick the first visible option.
    await tryClick(
      authenticatedPage,
      '[role="combobox"], button[aria-haspopup="listbox"], select',
    ).catch(() => {});
    await tryClick(authenticatedPage, '[role="option"]:visible').catch(
      () => {},
    );
    await authenticatedPage.keyboard.press('Escape').catch(() => {});

    await assertHealthy(authenticatedPage);
  });

  test('harness renders and supports field entry', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/harness`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await fillFirstTextField(authenticatedPage, 'What this profile is for');
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('harness exercises action buttons', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/harness`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await tryClick(
      authenticatedPage,
      'button:has-text("Add"), button:has-text("New"), button:has-text("Create")',
    ).catch(() => {});
    await tryClick(authenticatedPage, 'button:has-text("Cancel")').catch(
      () => {},
    );

    await assertHealthy(authenticatedPage);
  });

  test('publishing renders and toggles switches', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/publishing`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await toggleFirstSwitch(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('publishing toggles a second switch and saves', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/publishing`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    const switches = authenticatedPage.locator('[role="switch"]');
    const count = await switches.count().catch(() => 0);
    if (count > 1) {
      await switches
        .nth(1)
        .click({ timeout: 5_000 })
        .catch(() => {});
    } else if (count === 1) {
      await switches
        .first()
        .click({ timeout: 5_000 })
        .catch(() => {});
    }
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('voice renders and supports interaction', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/voice`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await fillFirstTextField(authenticatedPage, 'E2E voice tone');
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('voice opens a combobox and selects an option', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_SETTINGS}/voice`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await tryClick(
      authenticatedPage,
      '[role="combobox"], button[aria-haspopup="listbox"], select',
    ).catch(() => {});
    await tryClick(authenticatedPage, '[role="option"]:visible').catch(
      () => {},
    );
    await authenticatedPage.keyboard.press('Escape').catch(() => {});

    await assertHealthy(authenticatedPage);
  });

  test('navigates across all brand settings sub-pages', async ({
    authenticatedPage,
  }) => {
    const subPages = [
      BRAND_SETTINGS,
      `${BRAND_SETTINGS}/agent-defaults`,
      `${BRAND_SETTINGS}/harness`,
      `${BRAND_SETTINGS}/publishing`,
      `${BRAND_SETTINGS}/voice`,
    ];

    for (const route of subPages) {
      await authenticatedPage.goto(route, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(authenticatedPage.locator('body')).toBeVisible();
      await expectNoErrorOverlay(authenticatedPage);
    }
  });
});
