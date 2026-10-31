import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

import IssueDetail from './issue-detail';

const mocks = vi.hoisted(() => {
  const addComment = vi.fn();
  const findOne = vi.fn();
  const getChildren = vi.fn();
  const listComments = vi.fn();
  const updateTask = vi.fn();

  return {
    addComment,
    findOne,
    getChildren,
    getCommentsService: vi.fn(async () => ({
      addComment,
      list: listComments,
    })),
    getTasksService: vi.fn(async () => ({
      findOne,
      getByIdentifier: findOne,
      getChildren,
      updateTask,
    })),
    listComments,
    loggerError: vi.fn(),
    notificationsService: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    updateTask,
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const created = factory('test-token') as { getChildren?: unknown };
    if (created && typeof created === 'object' && 'getChildren' in created) {
      return mocks.getTasksService;
    }
    return mocks.getCommentsService;
  },
}));

// The "Back to issues" link must be scope-aware (#5397): a bare
// `APP_ROUTES.WORKSPACE.TASKS` `Link` renders on a pathname the workspace
// shell registry never recognizes, so the inspector adapter never activates
// after following it. `href()` builds the brand-scoped path when a brand is
// selected, else falls back to the org-scoped one — verified below.
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand-x${path}`,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => mocks.notificationsService,
  },
}));

vi.mock('./issue-header', () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

vi.mock('./issue-sidebar', () => ({
  default: () => <div>Sidebar</div>,
}));

vi.mock('./issue-sub-issues-card', () => ({
  default: () => <div>Sub-issues</div>,
}));

vi.mock('./issue-comments-card', () => ({
  default: () => <div>Comments</div>,
}));

describe('IssueDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChildren.mockResolvedValue([]);
    mocks.listComments.mockResolvedValue([]);
  });

  it('scopes the back-to-issues link so the workspace shell recognizes the destination', () => {
    mocks.findOne.mockReturnValue(new Promise(() => {}));

    render(<IssueDetail issueId="task-1" />);

    expect(
      screen.getByRole('link', { name: /back to issues/i }),
    ).toHaveAttribute('href', '/acme/brand-x/workspace/tasks');
  });

  it('renders the back link and a loading placeholder while the issue loads, then the issue', async () => {
    let resolveFindOne!: (value: unknown) => void;
    mocks.findOne.mockReturnValue(
      new Promise((resolve) => {
        resolveFindOne = resolve;
      }),
    );

    render(<IssueDetail issueId="task-1" />);

    // Chrome: the back link renders immediately, before the issue resolves.
    expect(
      screen.getByRole('link', { name: /back to issues/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('issue-detail-loading')).toBeInTheDocument();
    expect(screen.queryByText('Sidebar')).not.toBeInTheDocument();

    resolveFindOne({
      description: '',
      id: 'task-1',
      identifier: 'TASK-1',
      priority: 'medium',
      status: 'todo',
      title: 'Ship shell-first loading',
    });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ship shell-first loading',
      }),
    ).toBeInTheDocument();
    // The task header keeps the visible title at level two, so the page has
    // exactly one level-one heading: the task title, never the generic "Page".
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Ship shell-first loading',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('issue-detail-loading'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to issues/i }),
    ).toBeInTheDocument();
  });

  it('renders the back link and a not-found card when the issue does not exist', async () => {
    mocks.findOne.mockRejectedValue(new Error('not found'));

    render(<IssueDetail issueId="missing-task" />);

    expect(
      screen.getByRole('link', { name: /back to issues/i }),
    ).toBeInTheDocument();

    expect(await screen.findByText('Issue not found')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Issue' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('issue-detail-loading'),
    ).not.toBeInTheDocument();
  });
});
