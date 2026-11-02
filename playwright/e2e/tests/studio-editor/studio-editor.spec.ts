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
 * E2E Tests for Studio Editor (the Remotion timeline, merged into Studio in #2309)
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify the Editor workspace load, starting a project from its prompt, toolbar
 * visibility, and save/publish controls.
 *
 * Every route is visited with the explicit E2E org+brand slugs (brandPath),
 * not a bare path: the proxy's active-workspace resolution for a bare
 * `/editor/*` path is cached server-side per session and is not
 * deterministic across parallel workers sharing one dev server.
 */

const EDIT_ROUTE = brandPath(APP_ROUTES.STUDIO.EDITOR);
const PROJECT_ID = 'editor-project-1';
const PROJECT_ROUTE = brandPath(`${APP_ROUTES.STUDIO.EDITOR}/${PROJECT_ID}`);
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
  /** Receives the JSON body of every create POST. */
  onCreate?: (body: unknown) => void;
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
    onCreate,
  }: EditorProjectsMockOptions = {},
): Promise<void> {
  let remainingListFailures = listFailures;

  await page.route(EDITOR_PROJECTS_PATTERN, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const isDetail = pathname.endsWith(`/editor-projects/${PROJECT_ID}`);

    if (method === 'POST' && !isDetail) {
      onCreate?.(request.postDataJSON());
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

const createProjectButton = (page: Page) =>
  page.getByRole('button', { exact: true, name: 'Create project' });

test.describe('Studio Editor', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  /**
   * `/editor` is one workspace: the prompt that starts a project on the left
   * (new-pane), the brand's projects on the right. There is no list page and
   * no `/editor/new`.
   */
  test.describe('Studio Editor Workspace', () => {
    test('lists existing projects beside the prompt', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, {
        listedProjects: [projectDocument()],
      });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'What are we editing?',
        }),
      ).toBeVisible();
      const allProjects = authenticatedPage.getByTestId('editor-projects-all');
      await expect(
        allProjects.getByRole('link', { name: /Untitled Project/ }),
      ).toHaveAttribute('href', new RegExp(`${PROJECT_ROUTE}$`));
      await expect(
        allProjects.getByText('Draft', { exact: true }),
      ).toBeVisible();
    });

    test('says there are no projects yet when the list is empty', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('heading', { name: 'No projects yet' }),
      ).toBeVisible();
      await expect(createProjectButton(authenticatedPage)).toBeVisible();
    });

    test('renders the workspace on mobile viewport without horizontal scrolling', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(
        authenticatedPage.getByRole('button', { name: /Vertical short/ }),
      ).toBeVisible();
      const hasOverflow = await authenticatedPage.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasOverflow).toBe(false);
    });

    test('renders the workspace on tablet viewport', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await expect(createProjectButton(authenticatedPage)).toBeVisible();
    });
  });

  test.describe('Starting an Editor project', () => {
    test('creates an untitled project and lands on its editor with real toolbar controls', async ({
      authenticatedPage,
    }) => {
      const created: unknown[] = [];
      await mockEditorProjects(authenticatedPage, {
        onCreate: (body) => created.push(body),
      });
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await createProjectButton(authenticatedPage).click();

      await expectProjectEditor(authenticatedPage);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        name: 'Untitled Project',
        settings: { format: 'landscape', height: 1080, width: 1920 },
      });
    });

    test('names the project after the prompt and cuts it for the chosen starter', async ({
      authenticatedPage,
    }) => {
      const created: unknown[] = [];
      await mockEditorProjects(authenticatedPage, {
        onCreate: (body) => created.push(body),
      });
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await authenticatedPage
        .getByRole('button', { name: /Vertical short/ })
        .click();
      await expect(
        authenticatedPage.getByRole('textbox', { name: 'Project name' }),
      ).toContainText('Vertical short');
      await createProjectButton(authenticatedPage).click();

      await expect(authenticatedPage).toHaveURL(new RegExp(`${PROJECT_ROUTE}$`));
      expect(created[0]).toMatchObject({
        name: 'Vertical short',
        settings: { format: 'portrait', height: 1920, width: 1080 },
      });
    });

    test('starts the timeline from the videos in ?video=', async ({
      authenticatedPage,
    }) => {
      const created: unknown[] = [];
      await mockEditorProjects(authenticatedPage, {
        onCreate: (body) => created.push(body),
      });
      await assertRouteRenders(
        authenticatedPage,
        `${EDIT_ROUTE}?video=shot-2&video=shot-1`,
      );

      await expect(
        authenticatedPage.getByText(
          '2 videos are ready to open on the timeline, in order.',
        ),
      ).toBeVisible();
      await createProjectButton(authenticatedPage).click();

      await expect(authenticatedPage).toHaveURL(new RegExp(`${PROJECT_ROUTE}$`));
      expect(created[0]).toMatchObject({
        name: 'Video Edit',
        sourceVideoIds: ['shot-2', 'shot-1'],
      });
    });

    test('stays on the workspace and says so when project creation fails', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, { createStatus: 500 });
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await createProjectButton(authenticatedPage).click();

      await expect(
        authenticatedPage
          .getByRole('alert')
          .filter({ hasText: 'Could not create the project. Try again.' }),
      ).toBeVisible();
      await expect(authenticatedPage).toHaveURL(new RegExp(`${EDIT_ROUTE}$`));
      await expectNoErrorOverlay(authenticatedPage);
    });
  });

  test.describe('Studio Editor Navigation', () => {
    test('should open Apps from the topbar Apps link', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage);
      const studioPage = new StudioPage(authenticatedPage);

      await assertRouteRenders(authenticatedPage, studioPage.url);

      // Studio tools are separate apps (#5502): the topbar's Apps icon opens
      // Apps (formerly the Store), where members install and pin them.
      await authenticatedPage.getByTestId('topbar-apps-link').click();

      await expect(authenticatedPage).toHaveURL(/\/apps(?:[/?#]|$)/);
      await expectNoErrorOverlay(authenticatedPage);
    });

    test('should open a project from its row in the list', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, {
        listedProjects: [projectDocument()],
      });
      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      await authenticatedPage
        .getByTestId('editor-projects-all')
        .getByRole('link', { name: /Untitled Project/ })
        .click();

      await expectProjectEditor(authenticatedPage);
    });
  });

  test.describe('Error Handling', () => {
    test('should show a retryable error state, not crash, when the projects list request fails', async ({
      authenticatedPage,
    }) => {
      await mockEditorProjects(authenticatedPage, { listFailures: 1 });

      await assertRouteRenders(authenticatedPage, EDIT_ROUTE);

      // Real error state (EditorProjectsList → ErrorFallback): a
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
        authenticatedPage.getByRole('heading', { name: 'No projects yet' }),
      ).toBeVisible();
      await expect(errorAlert).toHaveCount(0);
    });
  });
});

test.describe('Studio Editor — Unauthenticated Access', () => {
  test('should redirect editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await assertRouteRenders(unauthenticatedPage, APP_ROUTES.STUDIO.EDITOR, {
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
      `${APP_ROUTES.STUDIO.EDITOR}/test-project-id`,
      {
        allowRedirectToLogin: true,
      },
    );

    await expect(unauthenticatedPage).toHaveURL(/\/login\?callbackUrl=/, {
      timeout: 10000,
    });
  });
});
