import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { StudioPage } from '../../pages/studio.page';
import { brandPath } from '../../utils/app-chrome';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * E2E Tests for Studio Edit (the Remotion timeline, merged into Studio in #2309)
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify the edit surface load, new project creation, toolbar
 * visibility, and save/publish controls.
 *
 * Every route is visited with the explicit E2E org+brand slugs (brandPath),
 * not a bare path: the proxy's active-workspace resolution for a bare
 * `/studio/*` path is cached server-side per session and is not
 * deterministic across parallel workers sharing one dev server.
 */

const EDIT_ROUTE = brandPath(APP_ROUTES.STUDIO.EDIT);
const EDIT_NEW_ROUTE = brandPath(APP_ROUTES.STUDIO.EDIT_NEW);
const PROJECT_ID = 'editor-project-1';
const PROJECT_ROUTE = brandPath(`${APP_ROUTES.STUDIO.EDIT}/${PROJECT_ID}`);

/**
 * /studio/edit/new (new-editor-project-page.tsx) is a transient redirect: it
 * POSTs a new project on mount and replaces the URL with
 * `/studio/edit/:id` on success, or back to `/studio/edit` if the create call
 * fails. A test that asserts it as a stable landing URL never mocks the
 * create call, so it always takes the failure branch — the project never
 * exists — and lands back on the plain list.
 */
async function mockEditorProject(page: Page): Promise<void> {
  const project = {
    id: PROJECT_ID,
    name: 'Untitled Project',
    settings: {
      backgroundColor: '#000000',
      format: 'LANDSCAPE',
      fps: 30,
      height: 1080,
      width: 1920,
    },
    status: 'DRAFT',
    totalDurationFrames: 300,
    tracks: [],
  };

  await page.route('**/api.genfeed.ai/*/editor-projects**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();

    if (method === 'POST' && !url.endsWith(`/${PROJECT_ID}`)) {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: project,
            id: PROJECT_ID,
            type: 'editor-projects',
          },
        }),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    if (method === 'GET' && url.endsWith(`/${PROJECT_ID}`)) {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: project,
            id: PROJECT_ID,
            type: 'editor-projects',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    // fallback(), not continue(): the latter sends the request straight to
    // the real network, bypassing setupApiMocks' generic catch-all
    // (registered earlier, so lower priority) that would otherwise answer
    // the plain projects-list GET with an empty collection.
    await route.fallback();
  });
}

test.describe('Studio Edit', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Studio Edit Projects Page', () => {
    test('should display the projects list with a New Project action', async ({
      authenticatedPage,
    }) => {
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // Real content (editor-projects-page.tsx): a "New Project" link is
      // rendered whether or not the org already has projects.
      await expect(
        authenticatedPage.getByRole('link', {
          name: 'New Project',
          exact: true,
        }),
      ).toBeVisible();
    });

    test('should display the empty state with a Start New Project action', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/editor-projects**',
        async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Create Your First Project',
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('link', { name: 'Start New Project' }),
      ).toBeVisible();
    });

    test('should render the projects list on mobile viewport', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('link', {
          name: 'New Project',
          exact: true,
        }),
      ).toBeVisible();
    });

    test('should render the projects list on tablet viewport', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('link', {
          name: 'New Project',
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe('New Editor Project', () => {
    test('creates a project and lands on its editor with real toolbar controls', async ({
      authenticatedPage,
    }) => {
      await mockEditorProject(authenticatedPage);

      await authenticatedPage.goto(EDIT_NEW_ROUTE, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      });

      // new-editor-project-page.tsx replaces the URL once create() resolves.
      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${PROJECT_ROUTE}$`),
      );
      await assertRouteRenders(authenticatedPage, PROJECT_ROUTE);

      // Real controls (EditorToolbar.tsx): Save starts disabled (nothing to
      // save yet); Render is always enabled and always present.
      await expect(
        authenticatedPage.getByRole('button', { name: 'Save' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('button', { name: 'Save' }),
      ).toBeDisabled();
      await expect(
        authenticatedPage.getByRole('button', { name: 'Render' }),
      ).toBeEnabled();
    });

    test('renders on mobile viewport', async ({ authenticatedPage }) => {
      await mockEditorProject(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto(EDIT_NEW_ROUTE, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${PROJECT_ROUTE}$`),
      );
      await assertRouteRenders(authenticatedPage, PROJECT_ROUTE);
      await expect(
        authenticatedPage.getByRole('button', { name: 'Render' }),
      ).toBeVisible();
    });

    test('falls back to the projects list when project creation fails', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/editor-projects**',
        async (route) => {
          if (route.request().method() === 'POST') {
            await route.fulfill({
              body: JSON.stringify({
                errors: [{ title: 'Internal Server Error' }],
              }),
              contentType: 'application/json',
              status: 500,
            });
            return;
          }
          await route.continue();
        },
      );

      await authenticatedPage.goto(EDIT_NEW_ROUTE, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      });

      // new-editor-project-page.tsx's catch branch replaces the URL with the
      // plain list — the real, current behaviour of a failed create, not a
      // crash or a blank page.
      await expect(authenticatedPage).toHaveURL(new RegExp(`${EDIT_ROUTE}$`));
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);
    });
  });

  test.describe('Studio Edit Navigation', () => {
    test('should navigate from studio hub to editor', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.goto();
      await studioPage.waitForPageLoad();

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);
      await expect(
        authenticatedPage.getByRole('link', {
          name: 'New Project',
          exact: true,
        }),
      ).toBeVisible();
    });

    test('should navigate from the projects list to a new project', async ({
      authenticatedPage,
    }) => {
      await mockEditorProject(authenticatedPage);
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // Real control, no if/else fallback: editor-projects-page.tsx always
      // renders the "New Project" header action regardless of whether the
      // org has existing projects (Container's `right` slot).
      await authenticatedPage
        .getByRole('link', { name: 'New Project', exact: true })
        .click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${PROJECT_ROUTE}$`),
      );
      await assertRouteRenders(authenticatedPage, PROJECT_ROUTE);
      await expect(
        authenticatedPage.getByRole('button', { name: 'Render' }),
      ).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should show a retryable error state, not crash, when the projects list request fails', async ({
      authenticatedPage,
    }) => {
      let hasFailed = false;
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/editor-projects**',
        async (route) => {
          if (route.request().method() === 'GET') {
            if (!hasFailed) {
              hasFailed = true;
              await route.fulfill({
                body: JSON.stringify({
                  errors: [{ title: 'Internal Server Error' }],
                }),
                contentType: 'application/json',
                status: 500,
              });
              return;
            }
            // Retry succeeds — proves "Try again" actually re-fetches.
            await route.fulfill({
              body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // Real error state (editor-projects-page.tsx → ErrorFallback): a
      // distinct alert, not the empty-state affordance and not a crash.
      // Scoped past Next.js's own `role="alert"` route announcer
      // (#__next-route-announcer__, present on every page) via `.filter()`
      // rather than `.first()` — the announcer is a always-present
      // incidental duplicate, not an ambiguity in this app's own markup.
      const errorAlert = authenticatedPage
        .getByRole('alert')
        .filter({ hasText: 'Projects could not be loaded.' });
      await expect(errorAlert).toBeVisible();
      await expect(
        errorAlert.getByRole('heading', {
          name: 'Projects could not be loaded.',
        }),
      ).toBeVisible();

      // "Try again" (resetErrorBoundary → loadProjects) actually recovers.
      await errorAlert.getByRole('button', { name: 'Try again' }).click();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Create Your First Project',
        }),
      ).toBeVisible();
    });
  });
});

test.describe('Studio Edit — Unauthenticated Access', () => {
  test('should redirect editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.STUDIO.EDIT, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect new editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.STUDIO.EDIT_NEW, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect editor detail page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(
      `${APP_ROUTES.STUDIO.EDIT}/test-project-id`,
      {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
