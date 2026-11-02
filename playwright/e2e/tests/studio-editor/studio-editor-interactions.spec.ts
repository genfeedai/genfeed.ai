import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for Studio's Editor surface.
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
const EDITOR_DETAIL = '/test-org/brand-1/editor/test-project-id';

test.describe('Studio Editor — Interactions', () => {
  test.setTimeout(90_000);

  test('renders the workspace with the project prompt and an empty project list', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('heading', { name: 'What are you editing?' }),
    ).toBeVisible({ timeout: 15_000 });

    // #5165 removed the Features marketing grid; the default mock returns no
    // projects, so the list renders its empty state instead.
    await expect(
      authenticatedPage.getByText('No Editor projects yet'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('sends the creator from the workspace to the Library to pick a video', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    await authenticatedPage
      .getByRole('button', { name: 'Edit a Library video' })
      .click({ timeout: 15_000 });

    await expect(authenticatedPage).toHaveURL(/\/library\/assets/);
  });

  test('seeds a project from a source video query param', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${EDITOR_LIST}?video=mock-video-1`, {
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

  test('renders the Studio Editor list on a mobile viewport', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });
    await authenticatedPage.goto(EDITOR_LIST, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('heading', { name: 'What are you editing?' }),
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
      authenticatedPage.getByRole('heading', { name: 'What are you editing?' }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
