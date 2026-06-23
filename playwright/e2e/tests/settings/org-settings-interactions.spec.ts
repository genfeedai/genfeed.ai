import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertHealthy } from '../../utils/interaction-helpers';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * E2E interaction coverage for ORGANIZATION + PERSONAL settings surfaces.
 *
 * Routes live under `/test-org/~/settings/...`. Auth, Better Auth and the API
 * (organizations / members / billing / credits / settings writes) are fully
 * mocked, so opening tabs, toggling options, opening create/invite modals and
 * saving forms are all safe and resolve as success. Interactions are
 * best-effort: selectors fall back to `tryClick` and are guarded with `.catch()`
 * so a missing control never hard-fails the spec — the goal is to exercise
 * interactive code paths for coverage.
 */

const SETTINGS = '/test-org/~/settings';

/** Navigate to a settings route and settle the DOM. */
async function goToSettings(page: Page, route: string): Promise<void> {
  await page.goto(route, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
}

/** Toggle the first visible switch/checkbox on the page (best-effort). */
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

/** Close any open modal/overlay via Cancel/Close button then Escape. */
async function closeOverlay(page: Page): Promise<void> {
  await tryClick(
    page,
    'button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]',
  ).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

test.describe('Organization & Personal Settings — Interactions', () => {
  test.setTimeout(90_000);

  test('settings root renders and supports interaction', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, SETTINGS);

    await tryClick(
      authenticatedPage,
      'a[href*="settings"], button:has-text("Edit")',
    ).catch(() => {});

    await assertHealthy(authenticatedPage);
  });

  test('personal settings edits a profile field and saves', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/personal`);

    await fillFirstTextField(authenticatedPage, 'E2E Display Name');
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('personal settings toggles a preference switch', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/personal`);

    await toggleFirstSwitch(authenticatedPage);
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('organization settings edits a field and saves', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/organization`);

    await fillFirstTextField(authenticatedPage, 'E2E Org Name');
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('organization policy toggles options and saves', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/organization/policy`);

    await toggleFirstSwitch(authenticatedPage);
    await tryClick(
      authenticatedPage,
      '[role="combobox"], button[aria-haspopup="listbox"], select',
    ).catch(() => {});
    await tryClick(authenticatedPage, '[role="option"]:visible').catch(
      () => {},
    );
    await authenticatedPage.keyboard.press('Escape').catch(() => {});
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('organization members opens and closes the invite modal', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/organization/members`);

    await tryClick(
      authenticatedPage,
      'button:has-text("Invite Member"), button:has-text("Invite")',
    ).catch(() => {});

    // Fill anything the invite modal exposes, then close it without inviting.
    await fillFirstTextField(authenticatedPage, 'invitee@genfeed.ai');
    await closeOverlay(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('organization api-keys expands a provider and enters a key', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/organization/api-keys`);

    // Expand the first provider card / toggle, then enter a fake key.
    await tryClick(
      authenticatedPage,
      'button:has-text("Add"), button:has-text("Connect"), button:has-text("Configure"), [role="button"]',
    ).catch(() => {});
    await fillFirstTextField(authenticatedPage, 'sk-e2e-fake-key');
    await clickSave(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('organization billing renders and exercises actions', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/organization/billing`);

    await tryClick(
      authenticatedPage,
      'button:has-text("Buy"), button:has-text("Upgrade"), button:has-text("Manage"), a:has-text("Upgrade")',
    ).catch(() => {});
    await closeOverlay(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('brands list opens and closes a create-brand flow', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/brands`);

    await tryClick(
      authenticatedPage,
      'button:has-text("New"), button:has-text("Create"), button:has-text("Add Brand"), button:has-text("Add")',
    ).catch(() => {});
    await fillFirstTextField(authenticatedPage, 'E2E Brand');
    await closeOverlay(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('image models settings changes a select option', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/models/image`);

    await tryClick(
      authenticatedPage,
      '[role="combobox"], button[aria-haspopup="listbox"], select',
    ).catch(() => {});
    await tryClick(authenticatedPage, '[role="option"]:visible').catch(
      () => {},
    );
    await authenticatedPage.keyboard.press('Escape').catch(() => {});
    await toggleFirstSwitch(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('scenes elements settings opens a create flow and closes it', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/elements/scenes`);

    await tryClick(
      authenticatedPage,
      'button:has-text("New"), button:has-text("Create"), button:has-text("Add")',
    ).catch(() => {});
    await fillFirstTextField(authenticatedPage, 'E2E Scene');
    await closeOverlay(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('help settings renders and exercises links/actions', async ({
    authenticatedPage,
  }) => {
    await goToSettings(authenticatedPage, `${SETTINGS}/help`);

    await tryClick(
      authenticatedPage,
      'button:has-text("Copy"), button, a[href]',
    ).catch(() => {});

    await assertHealthy(authenticatedPage);
  });

  test('navigates across all org & personal settings sub-pages', async ({
    authenticatedPage,
  }) => {
    const subPages = [
      SETTINGS,
      `${SETTINGS}/personal`,
      `${SETTINGS}/organization`,
      `${SETTINGS}/organization/policy`,
      `${SETTINGS}/organization/members`,
      `${SETTINGS}/organization/api-keys`,
      `${SETTINGS}/organization/billing`,
      `${SETTINGS}/brands`,
      `${SETTINGS}/models/image`,
      `${SETTINGS}/elements/scenes`,
      `${SETTINGS}/help`,
    ];

    for (const route of subPages) {
      await goToSettings(authenticatedPage, route);
      await expect(authenticatedPage.locator('body')).toBeVisible();
      await expectNoErrorOverlay(authenticatedPage);
    }
  });
});
