import { EditorProjectStatus, IngredientFormat } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { StudioPage } from '../../pages/studio.page';
import { brandPath } from '../../utils/app-chrome';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

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
const EDITOR_PROJECTS_PATTERN = '**/api.genfeed.ai/*/editor-projects**';
// EditorToolbar's FORMAT_OPTIONS label for IngredientFormat.LANDSCAPE.
const LANDSCAPE_FORMAT_LABEL = '16:9';

// Shaped by IEditorProject and serialized as editorProjectSerializerConfig
// (JSON:API type `editor-project`).
const project: Pick<
  IEditorProject,
  'id' | 'name' | 'settings' | 'status' | 'totalDurationFrames' | 'tracks'
> = {
  id: PROJECT_ID,
  name: 'Untitled Project',
  settings: {
    backgroundColor: '#000000',
    format: IngredientFormat.LANDSCAPE,
    fps: 30,
    height: 1080,
    width: 1920,
  },
  status: EditorProjectStatus.DRAFT,
  totalDurationFrames: 300,
  tracks: [],
};

function projectDocument() {
  return {
    attributes: project,
    id: PROJECT_ID,
    type: 'editor-project',
  };
}

async function fulfillJson(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

interface EditorProjectsMockOptions {
  /** Projects returned by the list GET (default: none). */
  listedProjects?: ReturnType<typeof projectDocument>[];
  /** Status of the create POST (default: 201 with the project). */
  createStatus?: 201 | 500;
  /** Number of list GETs that fail with 500 before succeeding (default: 0). */
  listFailures?: number;
}

/**
 * One handler for every `/editor-projects` call: list GET, create POST and
 * detail GET are all answered here, so nothing reaches the real network or
 * the strict network guard.
 */
async function mockEditorProjects(
  page: Page,
  {
    createStatus = 201,
    listFailures = 0,
    listedProjects = [],
  }: EditorProjectsMockOptions = {},
): Promise<void> {
  let remainingListFailures = listFailures;

  await page.route(EDITOR_PROJECTS_PATTERN, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const isDetail = pathname.endsWith(`/editor-projects/${PROJECT_ID}`);

    if (method === 'POST' && !isDetail) {
      if (createStatus === 500) {
        await fulfillJson(route, 500, {
          errors: [{ title: 'Internal Server Error' }],
        });
        return;
      }
      await fulfillJson(route, 201, { data: projectDocument() });
      return;
    }

    if (method === 'GET' && isDetail) {
      await fulfillJson(route, 200, { data: projectDocument() });
      return;
    }

    if (method === 'GET') {
      if (remainingListFailures > 0) {
        remainingListFailures -= 1;
        await fulfillJson(route, 500, {
          errors: [{ title: 'Internal Server Error' }],
        });
        return;
      }
      await fulfillJson(route, 200, {
        data: listedProjects,
        meta: { totalCount: listedProjects.length },
      });
      return;
    }

    // Any other editor-projects call falls back to setupApiMocks' mocked
    // catch-all (registered earlier, so lower priority) — never the network.
    await route.fallback();
  });
}

/** The editor surface for PROJECT_ID, reached through a client transition. */
async function expectProjectEditor(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ROUTE}$`));
  await expectNoErrorOverlay(page);

  // Real controls (EditorToolbar.tsx): Save starts disabled (nothing to save
  // yet); Render is always enabled and always present.
  await expect(
    page.getByRole('button', { exact: true, name: 'Render' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { exact: true, name: 'Save' }),
  ).toBeDisabled();
  // The format selector reflects the project's contract format.
  await expect(
    page.getByRole('combobox').filter({ hasText: LANDSCAPE_FORMAT_LABEL }),
  ).toBeVisible();
}

const newProjectLink = (page: Page) =>
  page.getByRole('link', { exact: true, name: 'New Project' });

test.describe('Studio Edit', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Studio Edit Projects Page', () => {
    test('should list existing projects with a New Project action', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, {
        listedProjects: [projectDocument()],
      });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // Real content (editor-projects-page.tsx): one card per project, with
      // its contract format and status, plus the header "New Project" link.
      await expect(
        authenticatedPage.getByRole('link', { name: 'Open Untitled Project' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText(IngredientFormat.LANDSCAPE, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText(EditorProjectStatus.DRAFT, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(newProjectLink(authenticatedPage)).toBeVisible();
    });

    test('should display the empty state with a Start New Project action', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);

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
      await mockEditorProjects(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Create Your First Project',
        }),
      ).toBeVisible();
      await expect(newProjectLink(authenticatedPage)).toBeVisible();
    });

    test('should render the projects list on tablet viewport', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Create Your First Project',
        }),
      ).toBeVisible();
      await expect(newProjectLink(authenticatedPage)).toBeVisible();
    });
  });

  /**
   * /studio/edit/new (new-editor-project-page.tsx) is a transient redirect: it
   * POSTs a new project on mount and replaces the URL with `/studio/edit/:id`
   * on success, or back to `/studio/edit` if the create call fails.
   */
  test.describe('New Editor Project', () => {
    test('creates a project and lands on its editor with real toolbar controls', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);

      await assertRouteRenders(authenticatedPage, EDIT_NEW_ROUTE);

      await expectProjectEditor(authenticatedPage);
    });

    test('renders on mobile viewport', async ({ authenticatedPage }) => {
      await mockEditorProjects(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await assertRouteRenders(authenticatedPage, EDIT_NEW_ROUTE);

      await expectProjectEditor(authenticatedPage);
    });

    test('falls back to the projects list when project creation fails', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, { createStatus: 500 });

      await assertRouteRenders(authenticatedPage, EDIT_NEW_ROUTE);

      // new-editor-project-page.tsx's catch branch replaces the URL with the
      // plain list — the real, current behaviour of a failed create, not a
      // crash or a blank page.
      await expect(authenticatedPage).toHaveURL(new RegExp(`${EDIT_ROUTE}$`));
      await expectNoErrorOverlay(authenticatedPage);
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Create Your First Project',
        }),
      ).toBeVisible();
    });
  });

  test.describe('Studio Edit Navigation', () => {
    test('should navigate from studio hub to editor', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);
      const studioPage = new StudioPage(authenticatedPage);

      await assertRouteRenders(authenticatedPage, studioPage.url);

      // The Studio app nav (studio-menu-items.config.ts) links to Edit.
      await authenticatedPage
        .getByRole('complementary', { exact: true, name: 'Navigation' })
        .getByRole('link', { exact: true, name: 'Edit' })
        .click();

      await expect(authenticatedPage).toHaveURL(new RegExp(`${EDIT_ROUTE}$`));
      await expectNoErrorOverlay(authenticatedPage);
      await expect(newProjectLink(authenticatedPage)).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Create Your First Project',
        }),
      ).toBeVisible();
    });

    test('should navigate from the projects list to a new project', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // editor-projects-page.tsx always renders the "New Project" header
      // action regardless of whether the org has existing projects
      // (Container's `right` slot).
      await newProjectLink(authenticatedPage).click();

      await expectProjectEditor(authenticatedPage);
    });
  });

  test.describe('Error Handling', () => {
    test('should show a retryable error state, not crash, when the projects list request fails', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, { listFailures: 1 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // Real error state (editor-projects-page.tsx → ErrorFallback): a
      // distinct alert, not the empty-state affordance and not a crash.
      // Scoped past Next.js's own `role="alert"` route announcer
      // (#__next-route-announcer__, present on every page) via `.filter()`
      // rather than `.first()` — the announcer is an always-present
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
      await expect(errorAlert).toHaveCount(0);
    });
  });
});

test.describe('Studio Edit — Unauthenticated Access', () => {
  test('should redirect editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await assertRouteRenders(unauthenticatedPage, APP_ROUTES.STUDIO.EDIT, {
      allowRedirectToLogin: true,
    });

    await expect(unauthenticatedPage).toHaveURL(/\/login\?callbackUrl=/, {
      timeout: 10000,
    });
  });

  test('should redirect new editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await assertRouteRenders(unauthenticatedPage, APP_ROUTES.STUDIO.EDIT_NEW, {
      allowRedirectToLogin: true,
    });

    await expect(unauthenticatedPage).toHaveURL(/\/login\?callbackUrl=/, {
      timeout: 10000,
    });
  });

  test('should redirect editor detail page to login', async ({
    unauthenticatedPage,
  }) => {
    await assertRouteRenders(
      unauthenticatedPage,
      `${APP_ROUTES.STUDIO.EDIT}/test-project-id`,
      {
        allowRedirectToLogin: true,
      },
    );

    await expect(unauthenticatedPage).toHaveURL(/\/login\?callbackUrl=/, {
      timeout: 10000,
    });
  });
});
