import {
  EditorProjectStatus,
  EditorTrackType,
  IngredientFormat,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IEditorProject,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

/**
 * #5462 — projects generated from an approved composition template are
 * immutable on the server. The Editor must open them read-only, never send a
 * save, and turn them into an editable copy with "Duplicate to edit".
 *
 * All `/editor-projects` traffic is answered by an in-memory backend that
 * mirrors the API contract: the serializer's `isLocked`, the 409 on updating
 * a locked project, and `POST /:id/duplicate` creating an unlocked draft.
 */

const LOCKED_ID = 'composition-project-1';
const COPY_ID = 'composition-project-1-copy';
const EDITOR_PROJECTS_PATTERN = '**/api.genfeed.ai/*/editor-projects**';

type StoredProject = Pick<
  IEditorProject,
  | 'id'
  | 'isLocked'
  | 'name'
  | 'settings'
  | 'status'
  | 'totalDurationFrames'
  | 'tracks'
>;

const storyTrack: IEditorTrack = {
  clips: [
    {
      durationFrames: 120,
      effects: [],
      id: 'scene-0',
      ingredientId: '',
      ingredientUrl: '',
      sourceEndFrame: 120,
      sourceStartFrame: 0,
      startFrame: 0,
      textOverlay: {
        color: '#ffffff',
        fontFamily: 'Arial',
        fontSize: 62,
        fontWeight: 700,
        position: { x: 50, y: 50 },
        text: 'Product story',
      },
    },
  ],
  id: 'story',
  isLocked: false,
  isMuted: false,
  name: 'Story',
  type: EditorTrackType.TEXT,
  volume: 100,
};

function projectRoute(id: string): string {
  return brandPath(`${APP_ROUTES.STUDIO.EDIT}/${id}`);
}

function toDocument(project: StoredProject) {
  const { id, ...attributes } = project;
  return { attributes, id, type: 'editor-project' };
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

interface EditorBackend {
  patchedIds: string[];
  projects: Map<string, StoredProject>;
}

async function mockEditorBackend(page: Page): Promise<EditorBackend> {
  const backend: EditorBackend = {
    patchedIds: [],
    projects: new Map([
      [
        LOCKED_ID,
        {
          id: LOCKED_ID,
          isLocked: true,
          name: 'Product story',
          settings: {
            backgroundColor: '#123456',
            format: IngredientFormat.PORTRAIT,
            fps: 30,
            height: 1920,
            width: 1080,
          },
          status: EditorProjectStatus.DRAFT,
          totalDurationFrames: 120,
          tracks: [storyTrack],
        },
      ],
    ]),
  };

  await page.route(EDITOR_PROJECTS_PATTERN, async (route) => {
    const request = route.request();
    const method = request.method();
    const segments = new URL(request.url()).pathname.split('/');
    const index = segments.indexOf('editor-projects');
    const id = segments[index + 1];
    const action = segments[index + 2];
    const project = id ? backend.projects.get(id) : undefined;

    if (id && !project) {
      await fulfillJson(route, 404, {
        errors: [{ status: '404', title: 'Editor project not found' }],
      });
      return;
    }

    if (method === 'GET' && project) {
      await fulfillJson(route, 200, { data: toDocument(project) });
      return;
    }

    if (method === 'POST' && project && action === 'duplicate') {
      const copy: StoredProject = {
        ...project,
        id: COPY_ID,
        isLocked: false,
        name: `${project.name} (copy)`,
        status: EditorProjectStatus.DRAFT,
      };
      backend.projects.set(COPY_ID, copy);
      await fulfillJson(route, 201, { data: toDocument(copy) });
      return;
    }

    if (method === 'PATCH' && project) {
      backend.patchedIds.push(project.id);
      if (project.isLocked) {
        await fulfillJson(route, 409, {
          errors: [
            {
              status: '409',
              title:
                'Approved compositions are immutable. Submit updated inputs with a new requestId.',
            },
          ],
        });
        return;
      }
      const updates = request.postDataJSON() as Partial<StoredProject>;
      const saved = { ...project, ...updates };
      backend.projects.set(project.id, saved);
      await fulfillJson(route, 200, { data: toDocument(saved) });
      return;
    }

    await route.fallback();
  });

  return backend;
}

test.describe('Studio Edit — locked template projects', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('opens a template project read-only, duplicates it, and persists edits to the copy', async ({
    authenticatedPage: page,
  }) => {
    const backend = await mockEditorBackend(page);

    await assertRouteRenders(page, projectRoute(LOCKED_ID));

    // Read-only on open, announced to assistive technology.
    const banner = page
      .getByRole('status')
      .filter({ hasText: 'This project is read-only' });
    await expect(banner).toBeVisible();
    await expect(
      page.getByRole('button', { exact: true, name: 'Save' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { exact: true, name: 'Render' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { exact: true, name: '+ Add Text' }),
    ).toBeDisabled();

    // The save shortcut never reaches the server.
    await page.keyboard.press('ControlOrMeta+s');
    expect(backend.patchedIds).toEqual([]);

    await banner.getByRole('button', { name: 'Duplicate to edit' }).click();

    await expect(page).toHaveURL(new RegExp(`${projectRoute(COPY_ID)}$`));
    await expectNoErrorOverlay(page);
    await expect(
      page.getByText('Product story (copy)', { exact: true }),
    ).toBeVisible();
    await expect(banner).toHaveCount(0);

    // The copy is editable and saves.
    await page.getByRole('button', { exact: true, name: '+ Add Text' }).click();
    const save = page.getByRole('button', { exact: true, name: 'Save' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    expect(backend.patchedIds).toEqual([COPY_ID]);

    // The edit survives a reload.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('New Text').first()).toBeVisible();
    expect(backend.projects.get(LOCKED_ID)?.tracks).toHaveLength(1);
    expect(backend.projects.get(COPY_ID)?.tracks).toHaveLength(2);
  });
});
