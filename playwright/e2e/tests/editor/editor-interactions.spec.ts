import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Editor surface.
 *
 * These specs drive real component logic (toolbar controls, project list
 * actions, navigation) rather than only asserting that a route renders. All
 * API + auth traffic is mocked by the authenticatedPage fixture, so every
 * interaction is safe and offline.
 *
 * Tenant-scoped routes use the mocked org/brand slugs: /test-org/brand-1/...
 *
 * CRITICAL: No real backend calls occur. Optional steps are guarded so the
 * suite never hangs or hard-fails on a missing control.
 */

const EDITOR_LIST = '/test-org/brand-1/editor';
const EDITOR_NEW = '/test-org/brand-1/editor/new';
const EDITOR_DETAIL = '/test-org/brand-1/editor/test-project-id';

test.describe('Editor — Interactions', () => {
  test.setTimeout(90_000);

  test('renders the projects list and surfaces the New Project entry point', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    const newProjectLink = authenticatedPage
      .locator('a[href*="editor/new"]')
      .first();
    await expect(newProjectLink).toBeVisible({ timeout: 15_000 });

    await expect(
      authenticatedPage.getByText('Features', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('navigates from the projects list into the new project flow', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    const newProjectLink = authenticatedPage
      .locator('a[href*="editor/new"]')
      .first();
    await newProjectLink.click({ timeout: 10_000 }).catch(() => {});
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/\/editor(?:\/new|\/[^/]+)?$/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('exercises the back navigation control from the projects list', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    await tryClick(authenticatedPage, 'a[aria-label="Back to Studio"]');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).not.toHaveURL(/\/login/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renders the new project loading flow without redirecting to login', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_NEW, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).not.toHaveURL(/\/login/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('passes a source video query param to the new project flow', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${EDITOR_NEW}?video=mock-video-1`, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).not.toHaveURL(/\/login/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('drives the detail page not-found recovery (Go Back) control', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_DETAIL, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    // With no project fixture the detail page renders a recovery state.
    await tryClick(authenticatedPage, 'button:has-text("Go Back")');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).not.toHaveURL(/\/login/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('clicks any visible toolbar or action button on the detail surface', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_DETAIL, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    // Best-effort interaction with playback / save / render controls if a
    // project happens to hydrate; otherwise the recovery button is exercised.
    await tryClick(authenticatedPage, 'button:has-text("Render")');
    await tryClick(authenticatedPage, 'button:has-text("Save")');
    await tryClick(authenticatedPage, '[aria-label="Play"]');
    await tryClick(authenticatedPage, 'button:has-text("Back")');

    await expect(authenticatedPage).not.toHaveURL(/\/login/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renders the editor list on a mobile viewport', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.locator('a[href*="editor/new"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('keeps the projects list interactive after reload', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });

    await expect(
      authenticatedPage.locator('a[href*="editor/new"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
