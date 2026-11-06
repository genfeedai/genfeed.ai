import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { QueryClient } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/management/tasks.service', () => ({
  TasksService: {
    getInstance: () => ({
      findOne: mocks.findOne,
      getByIdentifier: mocks.findOne,
      getChildren: mocks.getChildren,
      updateTask: mocks.updateTask,
    }),
  },
}));

vi.mock('@services/management/task-comments.service', () => ({
  TaskCommentsService: {
    getInstanceForTask: () => ({
      addComment: mocks.addComment,
      list: mocks.listComments,
    }),
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
  default: ({
    commentBody,
    comments,
    onAddComment,
    onCommentBodyChange,
  }: {
    commentBody: string;
    comments: Array<{ body: string; id: string }>;
    onAddComment: () => Promise<void>;
    onCommentBodyChange: (body: string) => void;
  }) => (
    <div>
      <ul aria-label="Comments">
        {comments.map((comment) => (
          <li key={comment.id}>{comment.body}</li>
        ))}
      </ul>
      <textarea
        aria-label="New comment"
        value={commentBody}
        onChange={(event) => onCommentBodyChange(event.target.value)}
      />
      <button type="button" onClick={() => void onAddComment()}>
        Post comment
      </button>
    </div>
  ),
}));

function renderIssueDetail(
  props: { issueId: string; useIdentifier?: boolean },
  client: QueryClient = createTestQueryClient(),
) {
  return render(<IssueDetail {...props} />, {
    wrapper: queryClientWrapper(client),
  });
}

const SHIPPING_TASK = {
  description: '',
  id: 'task-1',
  identifier: 'TASK-1',
  priority: 'medium',
  status: 'todo',
  title: 'Ship shell-first loading',
};

describe('IssueDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChildren.mockResolvedValue([]);
    mocks.listComments.mockResolvedValue([]);
  });

  it('scopes the back-to-issues link so the workspace shell recognizes the destination', () => {
    mocks.findOne.mockReturnValue(new Promise(() => {}));

    renderIssueDetail({ issueId: 'task-1' });

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

    renderIssueDetail({ issueId: 'task-1' });

    // Chrome: the back link renders immediately, before the issue resolves.
    expect(
      screen.getByRole('link', { name: /back to issues/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('issue-detail-loading')).toBeInTheDocument();
    expect(screen.queryByText('Sidebar')).not.toBeInTheDocument();

    resolveFindOne(SHIPPING_TASK);
    // The page paints once the task and its comments are both read.
    expect(await screen.findByText('Sidebar')).toBeInTheDocument();

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

    renderIssueDetail({ issueId: 'missing-task' });

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

  it('paints the cached task and its comments at once when it is reopened', async () => {
    mocks.findOne.mockResolvedValue(SHIPPING_TASK);
    mocks.listComments.mockResolvedValue([
      { body: 'Skeleton is gone on revisit', id: 'comment-1' },
    ]);
    const client = createTestQueryClient();
    const firstVisit = renderIssueDetail({ issueId: 'task-1' }, client);
    expect(
      await screen.findByText('Skeleton is gone on revisit'),
    ).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findOne.mockReturnValue(new Promise(() => {}));
    mocks.listComments.mockReturnValue(new Promise(() => {}));
    renderIssueDetail({ issueId: 'task-1' }, client);

    expect(screen.getByText('Skeleton is gone on revisit')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Ship shell-first loading',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('issue-detail-loading'),
    ).not.toBeInTheDocument();
  });

  it('never paints one task under another task id', async () => {
    mocks.findOne.mockResolvedValue(SHIPPING_TASK);
    const client = createTestQueryClient();
    const firstVisit = renderIssueDetail({ issueId: 'task-1' }, client);
    expect(await screen.findByText('Sidebar')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findOne.mockReturnValue(new Promise(() => {}));
    renderIssueDetail({ issueId: 'task-2' }, client);

    expect(screen.getByTestId('issue-detail-loading')).toBeInTheDocument();
    expect(
      screen.queryByText('Ship shell-first loading'),
    ).not.toBeInTheDocument();
  });

  it('shows the task when its sub-issues cannot be read', async () => {
    mocks.findOne.mockResolvedValue(SHIPPING_TASK);
    mocks.getChildren.mockRejectedValue(new Error('offline'));

    renderIssueDetail({ issueId: 'task-1' });

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Ship shell-first loading',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Issue not found')).not.toBeInTheDocument();
  });

  it('keeps the task on screen when a background refresh fails', async () => {
    mocks.findOne.mockResolvedValue(SHIPPING_TASK);
    const client = createTestQueryClient();
    const firstVisit = renderIssueDetail({ issueId: 'task-1' }, client);
    expect(await screen.findByText('Sidebar')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findOne.mockRejectedValue(new Error('offline'));
    renderIssueDetail({ issueId: 'task-1' }, client);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalled();
    });
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.queryByText('Issue not found')).not.toBeInTheDocument();
  });

  it('keeps a posted comment on screen when the comments could not be read', async () => {
    mocks.findOne.mockResolvedValue(SHIPPING_TASK);
    mocks.listComments.mockRejectedValue(new Error('offline'));
    mocks.addComment.mockResolvedValue({ body: 'Looks good', id: 'comment-1' });
    renderIssueDetail({ issueId: 'task-1' });
    await screen.findByText('Sidebar');
    await waitFor(() => expect(mocks.loggerError).toHaveBeenCalled());

    mocks.listComments.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('New comment'), {
      target: { value: 'Looks good' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    expect(
      await within(screen.getByRole('list', { name: 'Comments' })).findByText(
        'Looks good',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New comment')).toHaveValue('');
    expect(
      screen.queryByTestId('issue-detail-loading'),
    ).not.toBeInTheDocument();
    // The full list is read again rather than cached as just this comment.
    await waitFor(() => expect(mocks.listComments).toHaveBeenCalledTimes(2));
  });
});
