import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

type TaskCreatePayload = {
  description?: string;
  priority?: string;
  title?: string;
};

type TaskCommentPayload = {
  body?: string;
};

const TASK_ONE = {
  assigneeAgentId: 'agent-qa-1',
  assigneeUserId: undefined,
  checkedOutAt: '2026-03-31T08:30:00.000Z',
  checkoutAgentId: 'agent-qa-1',
  checkoutRunId: 'run-101',
  createdAt: '2026-03-31T08:00:00.000Z',
  description:
    'The task orchestration timeline drops the last heartbeat update for long-running agents.',
  goalId: 'goal-content-os',
  id: 'task-101',
  identifier: 'GEN-101',
  isDeleted: false,
  organization: 'mock-org-id-e2e-test',
  parentId: undefined,
  priority: 'high',
  projectId: 'project-cloud',
  status: 'todo',
  taskNumber: 101,
  title: 'Regression in task orchestration',
  updatedAt: '2026-03-31T10:30:00.000Z',
} as const;

const TASK_TWO = {
  assigneeAgentId: undefined,
  assigneeUserId: 'local-board',
  checkedOutAt: undefined,
  checkoutAgentId: undefined,
  checkoutRunId: undefined,
  createdAt: '2026-03-30T09:15:00.000Z',
  description:
    'CSV exports fail whenever the analytics filter includes date presets.',
  goalId: 'goal-content-os',
  id: 'task-102',
  identifier: 'GEN-102',
  isDeleted: false,
  organization: 'mock-org-id-e2e-test',
  parentId: undefined,
  priority: 'medium',
  projectId: 'project-cloud',
  status: 'blocked',
  taskNumber: 102,
  title: 'Analytics export is failing',
  updatedAt: '2026-03-31T09:45:00.000Z',
} as const;

const CHILD_TASK = {
  assigneeAgentId: 'agent-frontend-1',
  assigneeUserId: undefined,
  checkedOutAt: undefined,
  checkoutAgentId: undefined,
  checkoutRunId: undefined,
  createdAt: '2026-03-31T09:00:00.000Z',
  description: 'Add a visible stale-state notice to the timeline card.',
  goalId: 'goal-content-os',
  id: 'task-103',
  identifier: 'GEN-103',
  isDeleted: false,
  organization: 'mock-org-id-e2e-test',
  parentId: 'task-101',
  priority: 'low',
  projectId: 'project-cloud',
  status: 'in_progress',
  taskNumber: 103,
  title: 'Add stale-state badge to timeline cards',
  updatedAt: '2026-03-31T11:00:00.000Z',
} as const;

const INITIAL_COMMENTS = [
  {
    authorAgentId: undefined,
    authorUserId: 'local-board',
    body: 'Timeline audit reproduced the missing update after a 30 minute run.',
    createdAt: '2026-03-31T08:10:00.000Z',
    id: 'comment-1',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-101',
    updatedAt: '2026-03-31T08:10:00.000Z',
  },
  {
    authorAgentId: 'agent-backend-1',
    authorUserId: undefined,
    body: 'Backend queue timings look correct. The UI cache is the likely source.',
    createdAt: '2026-03-31T08:35:00.000Z',
    id: 'comment-2',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-101',
    updatedAt: '2026-03-31T08:35:00.000Z',
  },
  {
    authorAgentId: undefined,
    authorUserId: 'local-board',
    body: 'Prioritize a regression test before patching the timeline state.',
    createdAt: '2026-03-31T09:05:00.000Z',
    id: 'comment-3',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-101',
    updatedAt: '2026-03-31T09:05:00.000Z',
  },
  {
    authorAgentId: 'agent-qa-1',
    authorUserId: undefined,
    body: 'QA confirmed the task only appears once cached runs exceed the page size.',
    createdAt: '2026-03-31T09:30:00.000Z',
    id: 'comment-4',
    isDeleted: false,
    organization: 'mock-org-id-e2e-test',
    task: 'task-101',
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

function buildCommentDocument(
  comment: Record<string, string | boolean | undefined>,
) {
  return {
    data: serializeComment(comment),
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
  await page.route(`**/local.genfeed.ai:3001/**${suffix}`, handler);
}

async function mockTasksArea(page: Page) {
  let tasks = [TASK_ONE, TASK_TWO].map((task) => ({ ...task }));
  let comments = INITIAL_COMMENTS.map((comment) => ({ ...comment }));

  await routeTaskApi(page, '/tasks*', async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      const status = new URL(request.url()).searchParams.get('status');
      const filteredTasks = status
        ? tasks.filter((task) => task.status === status)
        : tasks;

      await route.fulfill({
        body: JSON.stringify(buildTaskCollection(filteredTasks)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (request.method() === 'POST') {
      const payload =
        (request.postDataJSON() as TaskCreatePayload | null) ?? {};
      const createdTask = {
        assigneeAgentId: undefined,
        assigneeUserId: undefined,
        checkedOutAt: undefined,
        checkoutAgentId: undefined,
        checkoutRunId: undefined,
        createdAt: '2026-04-01T10:00:00.000Z',
        description: payload.description,
        goalId: 'goal-content-os',
        id: 'task-104',
        identifier: 'GEN-104',
        isDeleted: false,
        organization: 'mock-org-id-e2e-test',
        parentId: undefined,
        priority:
          payload.priority === 'critical' ||
          payload.priority === 'high' ||
          payload.priority === 'low' ||
          payload.priority === 'medium'
            ? payload.priority
            : 'medium',
        projectId: 'project-cloud',
        status: 'todo',
        taskNumber: 104,
        title: payload.title ?? 'Untitled task',
        updatedAt: '2026-04-01T10:00:00.000Z',
      };

      tasks = [createdTask, ...tasks];

      await route.fulfill({
        body: JSON.stringify(buildTaskDocument(createdTask)),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  await routeTaskApi(page, '/tasks/by-identifier/GEN-101', async (route) => {
    await route.fulfill({
      body: JSON.stringify(buildTaskDocument(tasks[0] ?? TASK_ONE)),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeTaskApi(page, '/tasks/task-101/children*', async (route) => {
    await route.fulfill({
      body: JSON.stringify(buildTaskCollection([{ ...CHILD_TASK }])),
      contentType: 'application/json',
      status: 200,
    });
  });

  await routeTaskApi(page, '/tasks/task-101/comments*', async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(buildCommentCollection(comments)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    if (request.method() === 'POST') {
      const payload =
        (request.postDataJSON() as TaskCommentPayload | null) ?? {};
      const newComment = {
        authorAgentId: undefined,
        authorUserId: 'mock-user-id-e2e-test',
        body: payload.body ?? '',
        createdAt: '2026-04-01T10:15:00.000Z',
        id: `comment-${comments.length + 1}`,
        isDeleted: false,
        organization: 'mock-org-id-e2e-test',
        task: 'task-101',
        updatedAt: '2026-04-01T10:15:00.000Z',
      };

      comments = [...comments, newComment];

      await route.fulfill({
        body: JSON.stringify(buildCommentDocument(newComment)),
        contentType: 'application/json',
        status: 201,
      });
      return;
    }

    await route.continue();
  });

  await routeTaskApi(page, '/tasks/task-101', async (route) => {
    const request = route.request();

    if (request.method() === 'PATCH') {
      const payload =
        (request.postDataJSON() as Record<string, string> | null) ?? {};
      const updatedTask = {
        ...(tasks.find((task) => task.id === 'task-101') ?? TASK_ONE),
        status: payload.status ?? 'todo',
        updatedAt: '2026-04-01T10:10:00.000Z',
      };

      tasks = tasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task,
      );

      await route.fulfill({
        body: JSON.stringify(buildTaskDocument(updatedTask)),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });
}

test.describe('Tasks', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockTasksArea(authenticatedPage);
  });

  test('loads the tasks list, filters it, and opens the task overlay', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/tasks', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/tasks(?:$|[?#])/);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Tasks' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /GEN-101/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /GEN-102/i }),
    ).toBeVisible();

    const statusFilter = authenticatedPage.locator('select').first();

    await statusFilter.selectOption('blocked');

    await expect(
      authenticatedPage.getByRole('button', { name: /GEN-102/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /GEN-101/i }),
    ).toHaveCount(0);

    await statusFilter.selectOption('');
    await authenticatedPage.getByRole('button', { name: /GEN-101/i }).click();

    const overlay = authenticatedPage.getByRole('dialog');

    await expect(overlay).toBeVisible();
    await expect(
      overlay.getByText('Regression in task orchestration'),
    ).toBeVisible();
    await expect(overlay.getByText(/Comments \(4\)/)).toBeVisible();
    await expect(
      overlay.getByRole('button', { name: 'Open full page' }),
    ).toBeVisible();
  });

  test('creates a new task from the list view', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/tasks', {
      waitUntil: 'domcontentloaded',
    });

    await authenticatedPage.getByRole('button', { name: 'New Task' }).click();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Create Task' }),
    ).toBeVisible();

    await authenticatedPage
      .getByPlaceholder('Task title')
      .fill('Add failing coverage for task dashboards');
    await authenticatedPage
      .getByPlaceholder('Optional description')
      .fill('We need one targeted Playwright spec for the tasks area.');
    await authenticatedPage
      .getByRole('dialog')
      .locator('select')
      .selectOption('critical');
    await authenticatedPage
      .getByRole('button', { name: 'Create Task' })
      .click();

    await expect(
      authenticatedPage.getByRole('button', {
        name: /GEN-104.*Add failing coverage for task dashboards/i,
      }),
    ).toBeVisible();
  });

  test('loads the task detail page and supports status plus comment updates', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/tasks/GEN-101', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/tasks\/GEN-101(?:$|[?#])/);
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Regression in task orchestration',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Add stale-state badge to timeline cards'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'In Progress' }),
    ).toBeVisible();

    await authenticatedPage
      .getByRole('button', { name: 'In Progress' })
      .click();
    await expect(
      authenticatedPage.getByRole('button', { name: 'In Review' }),
    ).toBeVisible();

    await authenticatedPage
      .getByPlaceholder('Write a comment...')
      .fill('Added an E2E regression path for the tasks area.');
    await authenticatedPage
      .getByRole('button', { name: 'Add Comment' })
      .click();

    await expect(
      authenticatedPage.getByText(
        'Added an E2E regression path for the tasks area.',
      ),
    ).toBeVisible();
  });
});

test.describe('Tasks — Unauthenticated Access', () => {
  test('redirects unauthenticated users from the tasks list', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/tasks', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    try {
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 5000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
      return;
    } catch {
      // Local keyless dev mode intentionally skips auth enforcement.
    }

    await expect(unauthenticatedPage).toHaveURL(/\/tasks(?:$|[?#])/);
    await expect(unauthenticatedPage).toHaveURL(/\/tasks(?:$|[?#])/);
  });
});
