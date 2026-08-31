import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspacePageContent from './workspace-page';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) =>
    open ? (
      <div>
        {children}
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close
        </button>
      </div>
    ) : null,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  dismiss: vi.fn(),
  ensurePlanningThread: vi.fn(),
  findByIds: vi.fn(),
  findOne: vi.fn(),
  getExecutionById: vi.fn(),
  getToken: vi.fn(),
  keepOutput: vi.fn(),
  list: vi.fn(),
  loggerWarn: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  requestChanges: vi.fn(),
  resolveAuthToken: vi.fn(),
  searchParamsString: '',
  sentryAddBreadcrumb: vi.fn(),
  studioEnabled: true,
  subscribe: vi.fn(),
  trashOutput: vi.fn(),
  unkeepOutput: vi.fn(),
  workflowExecutions: [] as {
    creditsUsed: number;
    id: string;
    status: string;
  }[],
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: 'org-1',
  }),
  useBrandId: () => 'brand-1',
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: mocks.resolveAuthToken,
}));

vi.mock('@hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => mocks.studioEnabled,
}));

vi.mock('@hooks/data/trends/use-trends/use-trends', () => ({
  useTrends: () => ({
    error: null,
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
    refreshTrends: vi.fn(),
    selectedPlatform: 'all',
    setSelectedPlatform: vi.fn(),
    summary: {
      connectedPlatforms: [],
      lockedPlatforms: [],
      totalTrends: 0,
    },
    trends: [],
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: mocks.subscribe,
  }),
}));

vi.mock('@services/automation/workflow-executions.service', () => ({
  WorkflowExecutionsService: {
    getInstance: () => ({
      getById: mocks.getExecutionById,
    }),
  },
}));

vi.mock('@hooks/data/workflow-executions/use-workflow-executions', () => ({
  useWorkflowExecutions: () => {
    const executions = mocks.workflowExecutions;
    return {
      cancelExecution: vi.fn(),
      executions,
      isLoading: false,
      refresh: vi.fn(),
      stats: {
        active: executions.filter(
          (execution) =>
            execution.status === 'PENDING' || execution.status === 'RUNNING',
        ).length,
        completed: executions.filter(
          (execution) => execution.status === 'COMPLETED',
        ).length,
        failed: executions.filter((execution) => execution.status === 'FAILED')
          .length,
        total: executions.length,
        totalCredits: executions.reduce(
          (total, execution) => total + execution.creditsUsed,
          0,
        ),
      },
    };
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

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mocks.sentryAddBreadcrumb,
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
  useSearchParams: () => {
    const searchParams = new URLSearchParams(mocks.searchParamsString);

    return {
      get: (key: string) => searchParams.get(key),
      toString: () => mocks.searchParamsString,
    };
  },
}));

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
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
    linkedExecutionIds: [],
    organizationId: 'org-1',
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
    decomposition: {
      continuityQa: {
        clips: [
          {
            character: {
              confidence: 0.91,
              summary: 'Face shape changed.',
              verdict: 'drift',
            },
            clipId: 'task-clip-1',
            clipIndex: 0,
            errors: [],
            evidenceFrames: [
              {
                kind: 'contact_sheet',
                url: 'https://cdn.example.com/task-clip-sheet.png',
              },
            ],
            outfit: {
              confidence: 0.82,
              summary: 'Wardrobe changed.',
              verdict: 'drift',
            },
            product: {
              confidence: null,
              summary: 'Not visible.',
              verdict: 'not_assessed',
            },
          },
        ],
        completedAt: '2026-01-01T00:59:00.000Z',
        modelKey: 'openai/gpt-4.1-mini',
        projectId: 'clip-project-task',
        referenceAssetIds: { character: ['face-1'], product: [] },
        runId: 'clip-run-task',
        schemaVersion: 1,
        status: 'completed',
        summary: {
          assessedClipCount: 1,
          driftClipCount: 1,
          errorClipCount: 0,
          totalClipCount: 1,
        },
      },
    },
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
    linkedExecutionIds: ['execution-1'],
    resultPreview: 'Generated image preview',
    ...overrides,
  });
}

describe('WorkspacePageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString = '';
    mocks.replace.mockImplementation((nextHref: string) => {
      mocks.searchParamsString = nextHref.split('?')[1] ?? '';
    });
    mocks.studioEnabled = true;
    mocks.resolveAuthToken.mockResolvedValue('token-1');
    mocks.subscribe.mockReturnValue(vi.fn());
    mocks.workflowExecutions = [];
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
    mocks.getExecutionById.mockResolvedValue({
      id: 'execution-1',
      metadata: {
        artifactReferences: ['output-1', 'output-2', 'output-3'],
        threadId: 'report-thread-1',
      },
    });
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
    // Opening is optimistic: the inspector must not disappear while the
    // router is still applying the taskId query update.
    mocks.replace.mockImplementation(() => {});

    render(<WorkspacePageContent section="inbox" defaultInboxView="unread" />);

    expect(await screen.findByText('Campaign image')).toBeVisible();
    // Inbox chrome is Container header (tabs + refresh), not the snapshot strip.
    expect(screen.queryByTestId('workspace-snapshot')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /unread/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeVisible();
    expect(mocks.subscribe).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Campaign image'));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/workspace/inbox/unread?taskId=task-1',
      { scroll: false },
    );
    expect(
      await screen.findByTestId(
        'workspace-task-inspector',
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(await screen.findByText('Generated image preview')).toBeVisible();
    expect(await screen.findByText('Visual continuity QA')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Evidence frame 1' }),
    ).toHaveAttribute('href', 'https://cdn.example.com/task-clip-sheet.png');
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
    expect(mocks.push).toHaveBeenCalledWith('/agent/thread-1');
  });

  it('keeps the task inspector closed while URL cleanup is pending', async () => {
    mocks.searchParamsString = 'taskId=task-1';
    mocks.replace.mockImplementation(() => {});

    render(<WorkspacePageContent section="inbox" defaultInboxView="unread" />);

    expect(await screen.findByTestId('workspace-task-inspector')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(
        screen.queryByTestId('workspace-task-inspector'),
      ).not.toBeInTheDocument();
    });
    expect(mocks.replace).toHaveBeenCalledWith('/workspace/inbox/unread', {
      scroll: false,
    });
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
    mocks.workflowExecutions = [
      { creditsUsed: 4, id: 'execution-1', status: 'RUNNING' },
    ];

    render(
      <WorkspacePageContent
        section="overview"
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
              continuityQa: {
                clips: [
                  {
                    character: {
                      confidence: 0.91,
                      summary: 'Face shape changed.',
                      verdict: 'drift',
                    },
                    clipId: 'clip-2',
                    clipIndex: 1,
                    errors: [],
                    evidenceFrames: [
                      {
                        kind: 'contact_sheet',
                        url: 'https://cdn.example.com/clip-2-sheet.png',
                      },
                    ],
                    outfit: {
                      confidence: 0.8,
                      summary: 'Outfit changed.',
                      verdict: 'drift',
                    },
                    product: {
                      confidence: null,
                      summary: 'No product visible.',
                      verdict: 'not_assessed',
                    },
                  },
                ],
                completedAt: '2026-01-01T04:59:00.000Z',
                modelKey: 'openai/gpt-4.1-mini',
                projectId: 'clip-project-1',
                referenceAssetIds: {
                  character: ['face-1'],
                  product: [],
                },
                runId: 'clip-run-1',
                schemaVersion: 1,
                status: 'completed',
                summary: {
                  assessedClipCount: 1,
                  driftClipCount: 1,
                  errorClipCount: 0,
                  totalClipCount: 1,
                },
              },
              format: 'video',
              id: 'review-2',
              platform: 'tiktok',
              reviewDecision: 'request_changes',
              summary: 'Video needs edits',
            },
          ],
          rejectedCount: 0,
        }}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Overview',
      }),
    ).toHaveClass('sr-only');
    expect(screen.getByTestId('workspace-in-progress')).toBeVisible();
    expect(screen.getAllByText('Campaign image').length).toBeGreaterThan(0);
    expect(screen.getByText('Live runs')).toBeVisible();
    expect(screen.getByText('Approved hero image')).toBeVisible();
    expect(screen.getByText('Video needs edits')).toBeVisible();
    expect(screen.getByText(/Clip 2: character drift/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Evidence 1' })).toHaveAttribute(
      'href',
      'https://cdn.example.com/clip-2-sheet.png',
    );
    expect(screen.getByRole('link', { name: 'Open Review' })).toHaveAttribute(
      'href',
      '/acme-org/acme-creator/publishing/review',
    );
    expect(screen.getByText('Library snapshot')).toBeVisible();
    expect(screen.getByText('Overview', { selector: 'p' })).toBeVisible();
    expect(screen.getByText('Media')).toBeVisible();
    expect(screen.getByText('Audio + captions')).toBeVisible();
    expect(screen.getByText('Operator tools')).toBeVisible();
    expect(screen.getByLabelText('Studio')).toBeVisible();
  });

  it('removes Studio from operator tools when the capability is disabled', async () => {
    mocks.studioEnabled = false;

    render(<WorkspacePageContent section="overview" />);

    expect(await screen.findByText('Operator tools')).toBeVisible();
    expect(screen.queryByLabelText('Studio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Agent')).toBeVisible();
    expect(screen.getByLabelText('Workflows')).toBeVisible();
  });

  it('wraps the overview inbox preview in the canonical dashboard card', async () => {
    render(<WorkspacePageContent section="overview" />);

    const inbox = await screen.findByTestId('workspace-inbox');

    expect(within(inbox).getByText('Inbox')).toBeInTheDocument();
    expect(
      within(inbox).getByText('Latest items waiting on your review.'),
    ).toBeInTheDocument();
  });

  it('surfaces a visible warning and Sentry breadcrumb when overview task loading stalls', async () => {
    vi.useFakeTimers();
    mocks.list.mockReturnValueOnce(new Promise(() => undefined));

    try {
      render(<WorkspacePageContent section="overview" />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mocks.list).toHaveBeenCalledWith({});

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      expect(
        screen.getByText(
          'Workspace data is taking longer than expected. You can keep this page open or try again.',
        ),
      ).toBeVisible();
      expect(mocks.sentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'workspace.overview',
          data: expect.objectContaining({
            scope: 'tasks',
            timeoutMs: 15_000,
          }),
          level: 'warning',
          message: 'Workspace overview data load timed out',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
