import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspacePageContent from './workspace-page';

const mocks = vi.hoisted(() => ({
  agentRunsList: vi.fn(),
  approve: vi.fn(),
  dismiss: vi.fn(),
  ensurePlanningThread: vi.fn(),
  findByIds: vi.fn(),
  findOne: vi.fn(),
  getActiveRuns: vi.fn(),
  getBatch: vi.fn(),
  getRunStats: vi.fn(),
  getToken: vi.fn(),
  keepOutput: vi.fn(),
  list: vi.fn(),
  loggerWarn: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  requestChanges: vi.fn(),
  resolveClerkToken: vi.fn(),
  subscribe: vi.fn(),
  trashOutput: vi.fn(),
  unkeepOutput: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: 'org-1',
  }),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: mocks.resolveClerkToken,
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: mocks.subscribe,
  }),
}));

vi.mock('@services/ai/agent-runs.service', () => ({
  AgentRunsService: {
    getInstance: () => ({
      getActive: mocks.getActiveRuns,
      getBatch: mocks.getBatch,
      getStats: mocks.getRunStats,
      list: mocks.agentRunsList,
    }),
  },
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      findByIds: mocks.findByIds,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

vi.mock('@services/management/tasks.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@services/management/tasks.service')>();

  return {
    ...actual,
    TasksService: {
      getInstance: () => ({
        approve: mocks.approve,
        dismiss: mocks.dismiss,
        ensurePlanningThread: mocks.ensurePlanningThread,
        findOne: mocks.findOne,
        keepOutput: mocks.keepOutput,
        list: mocks.list,
        requestChanges: mocks.requestChanges,
        trashOutput: mocks.trashOutput,
        unkeepOutput: mocks.unkeepOutput,
      }),
    },
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-creator', orgSlug: 'acme-org' }),
  usePathname: () => '/workspace/inbox/unread',
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
  }),
}));

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    brand: 'brand-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    dismissedAt: null,
    eventStream: [],
    executionPathUsed: 'image_generation',
    id: 'task-1',
    identifier: 'TASK-1',
    isDeleted: false,
    linkedApprovalIds: [],
    linkedEntities: [],
    linkedOutputIds: [],
    linkedRunIds: [],
    organization: 'org-1',
    outputType: 'image',
    priority: 'high',
    progress: {
      activeRunCount: 1,
      message: 'Generating assets',
      percent: 60,
      stage: 'render',
    },
    request: 'Create a campaign image',
    reviewState: 'pending_approval',
    routingSummary: 'Image generation route',
    status: 'in_review',
    taskNumber: 1,
    title: 'Campaign image',
    updatedAt: '2026-01-01T01:00:00.000Z',
    ...overrides,
  };
}

function makeInspectorTask(overrides: Record<string, unknown> = {}) {
  return makeTask({
    approvedOutputIds: ['output-1'],
    eventStream: [
      {
        id: 'event-1',
        payload: { message: 'Ready for review' },
        timestamp: '2026-01-01T01:00:00.000Z',
        type: 'task_ready_for_review',
      },
    ],
    linkedIssueId: 'issue-1',
    linkedOutputIds: ['output-1', 'output-2'],
    linkedRunIds: ['run-1'],
    resultPreview: 'Generated image preview',
    ...overrides,
  });
}

describe('WorkspacePageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveClerkToken.mockResolvedValue('token-1');
    mocks.subscribe.mockReturnValue(vi.fn());
    mocks.agentRunsList.mockResolvedValue([]);
    mocks.getActiveRuns.mockResolvedValue([]);
    mocks.getRunStats.mockResolvedValue(null);
    mocks.list.mockResolvedValue([
      makeInspectorTask(),
      makeTask({
        id: 'task-2',
        identifier: 'TASK-2',
        reviewState: 'none',
        status: 'done',
        title: 'Completed caption',
      }),
    ]);
    mocks.approve.mockImplementation((taskId: string) =>
      Promise.resolve(
        makeTask({ id: taskId, reviewState: 'approved', status: 'done' }),
      ),
    );
    mocks.requestChanges.mockImplementation((taskId: string) =>
      Promise.resolve(
        makeTask({
          id: taskId,
          requestedChangesReason:
            'Please revise this task from the workspace inbox.',
          reviewState: 'changes_requested',
          status: 'in_review',
        }),
      ),
    );
    mocks.dismiss.mockImplementation((taskId: string) =>
      Promise.resolve(
        makeTask({
          dismissedAt: '2026-01-01T02:00:00.000Z',
          id: taskId,
          reviewState: 'dismissed',
        }),
      ),
    );
    mocks.keepOutput.mockImplementation((taskId: string) =>
      Promise.resolve(
        makeInspectorTask({
          approvedOutputIds: ['output-1', 'output-2'],
          id: taskId,
        }),
      ),
    );
    mocks.unkeepOutput.mockImplementation((taskId: string) =>
      Promise.resolve(makeInspectorTask({ approvedOutputIds: [], id: taskId })),
    );
    mocks.trashOutput.mockImplementation((taskId: string) =>
      Promise.resolve(
        makeInspectorTask({ id: taskId, linkedOutputIds: ['output-1'] }),
      ),
    );
    mocks.ensurePlanningThread.mockResolvedValue({
      created: true,
      seeded: true,
      threadId: 'thread-1',
    });
    mocks.findOne.mockResolvedValue({
      identifier: 'TASK-99',
    });
    mocks.getBatch.mockResolvedValue([
      {
        contentCount: 3,
        threadId: 'report-thread-1',
      },
    ]);
    mocks.findByIds.mockResolvedValue([
      {
        category: 'image',
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'output-1',
        isDeleted: false,
        metadataDescription: 'Primary generated image',
        metadataLabel: 'Hero image',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        category: 'image',
        createdAt: '2026-01-01T00:05:00.000Z',
        id: 'output-2',
        isDeleted: false,
        metadataDescription: 'Variant generated image',
        parent: 'output-1',
        promptText: 'Create a campaign image',
        updatedAt: '2026-01-01T00:05:00.000Z',
      },
    ]);
  });

  it('loads inbox tasks, opens the inspector, and executes task actions', async () => {
    render(<WorkspacePageContent section="inbox" defaultInboxView="unread" />);

    expect(await screen.findByText('Campaign image')).toBeVisible();
    expect(mocks.agentRunsList).not.toHaveBeenCalled();
    expect(screen.getByText('Workspace at a glance')).toBeVisible();
    expect(mocks.subscribe).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Campaign image'));

    expect(await screen.findByTestId('workspace-task-inspector')).toBeVisible();
    expect(await screen.findByText('Generated image preview')).toBeVisible();
    await waitFor(() => {
      expect(screen.getAllByText('Hero image').length).toBeGreaterThan(0);
    });
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledWith('issue-1'));
    expect(await screen.findByText('Open report thread')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Remove from kept' }));
    await waitFor(() =>
      expect(mocks.unkeepOutput).toHaveBeenCalledWith('task-1', 'output-1'),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Trash' })[0]);
    await waitFor(() =>
      expect(mocks.trashOutput).toHaveBeenCalledWith('task-1', 'output-1'),
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Request Changes' })[0],
    );
    await waitFor(() =>
      expect(mocks.requestChanges).toHaveBeenCalledWith(
        'task-1',
        'Please revise this task from the workspace inbox.',
      ),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith('task-1'));

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Plan Next Steps' })[0],
    );
    await waitFor(() =>
      expect(mocks.ensurePlanningThread).toHaveBeenCalledWith('task-1'),
    );
    expect(mocks.push).toHaveBeenCalledWith('/chat/thread-1');
  });

  it('refreshes tasks and applies realtime workspace updates', async () => {
    let realtimeHandler: ((payload: unknown) => void) | null = null;
    mocks.subscribe.mockImplementation(
      (_path: string, handler: (payload: unknown) => void) => {
        realtimeHandler = handler;
        return vi.fn();
      },
    );

    render(<WorkspacePageContent section="inbox" defaultInboxView="all" />);

    expect(await screen.findByText('Campaign image')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: /refresh/i })[0]);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));

    realtimeHandler?.({
      event: {
        id: 'event-2',
        payload: { message: 'Queued from realtime' },
        timestamp: '2026-01-01T03:00:00.000Z',
        type: 'task_queued',
      },
      organizationId: 'org-1',
      task: makeTask({
        id: 'task-3',
        identifier: 'TASK-3',
        title: 'Realtime video task',
      }),
      taskId: 'task-3',
    });

    expect(await screen.findByText('Realtime video task')).toBeVisible();
  });

  it('renders the overview surface with task streams, recent outputs, and operator links', async () => {
    render(
      <WorkspacePageContent
        section="overview"
        initialActiveRuns={[
          {
            id: 'run-1',
            status: 'running',
          },
        ]}
        initialReviewInbox={{
          approvedCount: 1,
          changesRequestedCount: 1,
          pendingCount: 2,
          readyCount: 3,
          recentItems: [
            {
              createdAt: '2026-01-01T04:00:00.000Z',
              format: 'image',
              id: 'review-1',
              platform: 'instagram',
              reviewDecision: 'approved',
              summary: 'Approved hero image',
            },
            {
              createdAt: '2026-01-01T05:00:00.000Z',
              format: 'video',
              id: 'review-2',
              platform: 'tiktok',
              reviewDecision: 'request_changes',
              summary: 'Video needs edits',
            },
          ],
          rejectedCount: 0,
        }}
        initialRuns={[]}
        initialStats={null}
      />,
    );

    expect(await screen.findByText('Workspace Dashboard')).toBeVisible();
    await waitFor(() =>
      expect(mocks.agentRunsList).toHaveBeenCalledWith({ page: 1 }),
    );
    expect(screen.getByTestId('workspace-in-progress')).toBeVisible();
    expect(screen.getAllByText('Campaign image').length).toBeGreaterThan(0);
    expect(screen.getByText('Live runs')).toBeVisible();
    expect(screen.getByText('Approved hero image')).toBeVisible();
    expect(screen.getByText('Video needs edits')).toBeVisible();
    expect(screen.getByText('Library snapshot')).toBeVisible();
    expect(screen.getByText('Ingredients')).toBeVisible();
    expect(screen.getByText('Operator tools')).toBeVisible();
    expect(screen.getByLabelText('Studio Image')).toBeVisible();
    expect(screen.getByLabelText('Studio Video')).toBeVisible();
  });
});
