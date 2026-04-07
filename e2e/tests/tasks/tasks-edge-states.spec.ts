import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

const BASE_TASK = {
  assigneeAgentId: 'agent-qa-1',
  assigneeUserId: undefined,
  checkedOutAt: '2026-03-31T08:30:00.000Z',
  checkoutAgentId: 'agent-qa-1',
  checkoutRunId: 'run-201',
  createdAt: '2026-03-31T08:00:00.000Z',
  description:
    'The task center needs stronger route-level coverage around empty and fallback states.',
  goalId: 'goal-content-os',
  id: 'task-201',
  identifier: 'GEN-201',
  isDeleted: false,
  organization: 'mock-org-id-e2e-test',
  parentId: undefined,
  priority: 'medium',
  projectId: 'project-cloud',
  status: 'todo',
  taskNumber: 201,
  title: 'Expand task center coverage',
  updatedAt: '2026-03-31T10:30:00.000Z',
} as const;

const COMMENT_FIXTURE = [
  {
    authorAgentId: undefined,
    authorUserId: 'local-board',
    body: 'Please add more route-level coverage before the next release.',
    createdAt: '2026-03-31T08:10:00.000Z',
    id: 'comment-201-1',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-201',
    updatedAt: '2026-03-31T08:10:00.000Z',
  },
  {
    authorAgentId: 'agent-qa-1',
    authorUserId: undefined,
    body: 'Current focus is empty states plus direct ID routes.',
    createdAt: '2026-03-31T08:35:00.000Z',
    id: 'comment-201-2',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-201',
    updatedAt: '2026-03-31T08:35:00.000Z',
  },
  {
    authorAgentId: undefined,
    authorUserId: 'local-board',
    body: 'Verify the fallback copy too, not just the happy path.',
    createdAt: '2026-03-31T09:05:00.000Z',
    id: 'comment-201-3',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-201',
    updatedAt: '2026-03-31T09:05:00.000Z',
  },
  {
    authorAgentId: 'agent-qa-1',
    authorUserId: undefined,
    body: 'Direct ID lookups now have explicit coverage in this pending spec.',
    createdAt: '2026-03-31T09:30:00.000Z',
    id: 'comment-201-4',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-201',
    updatedAt: '2026-03-31T09:30:00.000Z',
  },
] as const;

function serializeTask(task: Record<string, string | boolean | undefined>) {
  const { id, ...attributes } = task;

  return {
    attributes,
    id,
    type: 'tasks',
  };
}

function serializeComment(
  comment: Record<string, string | boolean | undefined>,
) {
  const { id, ...attributes } = comment;

  return {
    attributes,
    id,
    type: 'task-comments',
  };
}

function buildTaskDocument(task: Record<string, string | boolean | undefined>) {
  return {
    data: serializeTask(task),
  };
}

function buildTaskCollection(
  tasks: Array<Record<string, string | boolean | undefined>>,
) {
  return {
    data: tasks.map((task) => serializeTask(task)),
    meta: {
      page: 1,
      pageSize: tasks.length,
      totalCount: tasks.length,
    },
  };
}

function buildCommentCollection(
  comments: Array<Record<string, string | boolean | undefined>>,
) {
  return {
    data: comments.map((comment) => serializeComment(comment)),
    meta: {
      page: 1,
      pageSize: comments.length,
      totalCount: comments.length,
    },
  };
}

async function routeTaskApi(
  page: Page,
  suffix: string,
  handler: (route: Route) => Promise<void>,
) {
  await page.route(`**/api.genfeed.ai/**${suffix}`, handler);
  await page.route(`**/local.genfeed.ai:3010/**${suffix}`, handler);
}

async function mockTaskEdgeStates(
  page: Page,
  options?: {
    includeTask?: boolean;
    taskExists?: boolean;
  },
) {
  const includeTask = options?.includeTask ?? true;
  const taskExists = options?.taskExists ?? true;
  const tasks = includeTask ? [{ ...BASE_TASK }] : [];

  await routeTaskApi(page, '/tasks*', async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(buildTaskCollection(tasks)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });

  await routeTaskApi(page, '/tasks/task-201', async (route) => {
    if (!taskExists) {
      await route.fulfill({
        body: JSON.stringify({
          errors: [
            {
              detail: 'Task not found',
              status: '404',
              title: 'Not Found',
            },
          ],
        }),
        contentType: 'application/json',
        status: 404,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify(buildTaskDocument({ ...BASE_TASK })),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeTaskApi(page, '/tasks/task-201/children*', async (route) => {
    await route.fulfill({
      body: JSON.stringify(buildTaskCollection([])),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeTaskApi(page, '/tasks/task-201/comments*', async (route) => {
    await route.fulfill({
      body: JSON.stringify(buildCommentCollection([...COMMENT_FIXTURE])),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('Tasks Edge States', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('shows the empty state when the tasks list has no results', async ({
    authenticatedPage,
  }) => {
    await mockTaskEdgeStates(authenticatedPage, {
      includeTask: false,
    });

    await authenticatedPage.goto('/tasks', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage.getByText('No tasks found')).toBeVisible();
    await expect(
      authenticatedPage.getByText('Tasks will appear here once created'),
    ).toBeVisible();
  });

  test('supports the raw task id route in addition to the identifier route', async ({
    authenticatedPage,
  }) => {
    await mockTaskEdgeStates(authenticatedPage);

    await authenticatedPage.goto('/tasks/task-201', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/tasks\/task-201(?:$|[?#])/);
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Expand task center coverage',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', {
        name: /Show 1 earlier comment/i,
      }),
    ).toBeVisible();
  });

  test('shows the task-not-found fallback when the requested task is missing', async ({
    authenticatedPage,
  }) => {
    await mockTaskEdgeStates(authenticatedPage, {
      taskExists: false,
    });

    await authenticatedPage.goto('/tasks/task-201', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage.getByText('Task not found')).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Back to tasks' }),
    ).toHaveAttribute('href', '/tasks');
  });
});
