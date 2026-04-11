// @vitest-environment jsdom
'use client';

import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { TasksService } from '@services/management/tasks.service';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_TASK_COMPOSER_EVENT } from '@/lib/workspace/task-composer-events';
import WorkspacePageContent from './workspace-page';

const getTokenMock = vi.fn();
const listMock = vi.fn();
const createTaskMock = vi.fn();
const ensurePlanningThreadMock = vi.fn();
const getRunByIdMock = vi.fn();
const getRunContentMock = vi.fn();
const findIngredientMock = vi.fn();
const findIssueMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Moonrise Studio', name: null }],
    organizationId: 'org-1',
    selectedBrand: { id: 'brand-1', label: 'Moonrise Studio', name: null },
  }),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: vi.fn(),
}));

vi.mock('@hooks/utils/use-websocket-prompt/use-websocket-prompt', () => ({
  useWebsocketPrompt: () => vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/workspace/inbox/unread',
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@services/ai/agent-runs.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/ai/agent-runs.service')
  >('@services/ai/agent-runs.service');

  return {
    ...actual,
    AgentRunsService: {
      getInstance: vi.fn(),
    },
  };
});

vi.mock('@services/content/ingredients.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/content/ingredients.service')
  >('@services/content/ingredients.service');

  return {
    ...actual,
    IngredientsService: {
      getInstance: vi.fn(),
    },
  };
});

vi.mock('@services/management/tasks.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/management/tasks.service')
  >('@services/management/tasks.service');

  return {
    ...actual,
    TasksService: {
      getInstance: vi.fn(),
    },
  };
});

vi.mock('@tiptap/react', () => ({
  EditorContent: ({
    editor,
  }: {
    editor?: {
      options?: { editorProps?: { attributes?: Record<string, string> } };
    };
  }) => (
    <div
      data-testid="editor-content"
      data-aria-label={editor?.options?.editorProps?.attributes?.['aria-label']}
    />
  ),
  ReactRenderer: class {
    public element = document.createElement('div');
    public ref = { onKeyDown: vi.fn() };
    public destroy() {}
    public updateProps() {}
  },
  useEditor: () => ({
    commands: {
      clearContent: vi.fn(),
    },
    options: {
      editorProps: {
        attributes: {
          'aria-label': 'Target brand',
        },
      },
    },
  }),
}));

function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-03-30T10:00:00.000Z',
    executionPathUsed: 'agent_orchestrator',
    id: 'task-1',
    linkedApprovalIds: [],
    linkedOutputIds: [],
    linkedRunIds: [],
    organization: 'org-1',
    outputType: 'ingredient',
    platforms: [],
    priority: 'normal',
    request: 'Draft a launch plan',
    reviewState: 'none',
    reviewTriggered: false,
    routingSummary: 'Auto-routed',
    skillsUsed: [],
    skillVariantIds: [],
    status: 'triaged',
    title: 'Draft a launch plan',
    updatedAt: '2026-03-30T10:00:00.000Z',
    user: 'user-1',
    ...overrides,
  };
}

describe('WorkspacePageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/workspace/overview');
    getTokenMock.mockResolvedValue('clerk-token');
    vi.mocked(resolveClerkToken).mockResolvedValue('api-token');
    listMock.mockResolvedValue([]);
    createTaskMock.mockResolvedValue(buildTask());
    ensurePlanningThreadMock.mockResolvedValue({
      created: true,
      seeded: true,
      threadId: 'thread-plan-123',
    });
    getRunByIdMock.mockResolvedValue({
      id: 'run-1',
      thread: 'thread-report-123',
    });
    getRunContentMock.mockResolvedValue({
      ingredients: [],
      posts: [],
    });
    findIngredientMock.mockResolvedValue({
      category: 'ingredient',
      id: 'ingredient-1',
      metadataDescription: 'Hook variants for the campaign brief.',
      metadataLabel: 'Campaign Hook Pack',
      promptText: 'Create three launch-ready hooks.',
    });
    findIssueMock.mockResolvedValue({
      id: 'issue-1',
      identifier: 'GEN-42',
    });
    vi.mocked(TasksService.getInstance).mockReturnValue({
      approve: vi.fn(),
      createChildTasks: vi.fn(),
      createTask: createTaskMock,
      dismiss: vi.fn(),
      ensurePlanningThread: ensurePlanningThreadMock,
      findOne: findIssueMock,
      list: listMock,
      requestChanges: vi.fn(),
    } as unknown as ReturnType<typeof TasksService.getInstance>);
    vi.mocked(AgentRunsService.getInstance).mockReturnValue({
      getById: getRunByIdMock,
      getRunContent: getRunContentMock,
    } as unknown as ReturnType<typeof AgentRunsService.getInstance>);
    vi.mocked(IngredientsService.getInstance).mockReturnValue({
      findOne: findIngredientMock,
    } as unknown as ReturnType<typeof IngredientsService.getInstance>);
  });

  it('renders the overview layout without duplicate workspace tabs', async () => {
    render(<WorkspacePageContent section="overview" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    expect(screen.getByText('Workspace Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-stats-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-nav')).not.toBeInTheDocument();
  });

  it('opens the task composer modal from the dashboard header action', async () => {
    render(<WorkspacePageContent section="overview" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(screen.getByRole('button', { name: /^new task$/i }));

    expect(screen.getByText('New Task')).toBeInTheDocument();
  });

  it('opens the task composer modal when the sidebar requests a new task', async () => {
    render(<WorkspacePageContent section="overview" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    window.dispatchEvent(new Event(OPEN_TASK_COMPOSER_EVENT));

    expect(screen.getByText('New Task')).toBeInTheDocument();
  });

  it('creates a task from the modal composer', async () => {
    render(<WorkspacePageContent section="overview" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(screen.getByRole('button', { name: /^new task$/i }));
    fireEvent.change(screen.getByLabelText(/task request/i), {
      target: { value: 'Create a product launch brief' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          outputType: 'ingredient',
          request: 'Create a product launch brief',
        }),
      );
    });
  });

  it('includes heygenAvatarId/heygenVoiceId when the Facecam preset is selected', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url: RequestInfo | URL) => {
        const href = typeof url === 'string' ? url : url.toString();
        if (href.endsWith('/heygen/avatars')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  attributes: {
                    avatars: [
                      {
                        avatarId: 'avatar-42',
                        name: 'Default Avatar',
                        preview: null,
                      },
                    ],
                  },
                },
              }),
              { status: 200 },
            ),
          );
        }
        if (href.endsWith('/heygen/voices')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  attributes: {
                    voices: [{ voiceId: 'voice-99', name: 'Default Voice' }],
                  },
                },
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

    render(<WorkspacePageContent section="overview" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(screen.getByRole('button', { name: /^new task$/i }));
    fireEvent.change(screen.getByLabelText(/task request/i), {
      target: { value: 'Hello from Genfeed, this is a facecam test.' },
    });

    // Select Facecam preset (uppercase label inside the toolbar button)
    fireEvent.click(screen.getByRole('button', { name: /^facecam$/i }));

    // Wait for the picker fetch to populate
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          outputType: 'facecam',
          request: 'Hello from Genfeed, this is a facecam test.',
        }),
      );
    });

    fetchMock.mockRestore();
  });

  it('opens the canonical planning conversation from the task inspector', async () => {
    listMock.mockResolvedValue([
      buildTask({
        id: 'task-plan-1',
        planningThreadId: undefined,
        title: 'Launch planning task',
      }),
    ]);

    render(<WorkspacePageContent section="activity" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(
      screen.getByLabelText('Open details for Launch planning task'),
    );

    fireEvent.click(
      within(screen.getByTestId('workspace-task-inspector')).getByRole(
        'button',
        {
          name: /plan next steps/i,
        },
      ),
    );

    await waitFor(() => {
      expect(ensurePlanningThreadMock).toHaveBeenCalledWith('task-plan-1');
    });

    expect(routerPushMock).toHaveBeenCalledWith('/chat/thread-plan-123');
  });

  it('renders unread, recent, and all inbox routes on the dedicated inbox page', async () => {
    listMock.mockResolvedValue([
      buildTask({
        id: 'task-review',
        reviewState: 'pending_approval',
        status: 'needs_review',
        title: 'Review launch draft',
      }),
      buildTask({
        id: 'task-done',
        reviewState: 'approved',
        status: 'completed',
        title: 'Published recap',
      }),
    ]);

    const { rerender } = render(
      <WorkspacePageContent section="inbox" defaultInboxView="unread" />,
    );

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    expect(screen.queryByTestId('workspace-snapshot')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-advanced-tools'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /unread/i })).toHaveAttribute(
      'href',
      '/workspace/inbox/unread',
    );
    expect(screen.getByRole('tab', { name: /recent/i })).toHaveAttribute(
      'href',
      '/workspace/inbox/recent',
    );
    expect(screen.getByRole('tab', { name: /all/i })).toHaveAttribute(
      'href',
      '/workspace/inbox/all',
    );

    expect(
      screen.getByLabelText('Open details for Review launch draft'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Open details for Published recap'),
    ).not.toBeInTheDocument();

    rerender(<WorkspacePageContent section="inbox" defaultInboxView="all" />);

    expect(
      screen.getByLabelText('Open details for Published recap'),
    ).toBeInTheDocument();
  });

  it('opens the inspector sheet for inbox and activity items', async () => {
    listMock.mockResolvedValue([
      buildTask({
        id: 'task-activity-1',
        reviewState: 'pending_approval',
        status: 'needs_review',
        title: 'Investigate launch comment thread',
      }),
    ]);

    render(<WorkspacePageContent section="activity" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(
      screen.getByLabelText(
        'Open details for Investigate launch comment thread',
      ),
    );

    expect(screen.getByTestId('workspace-task-inspector')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('workspace-task-inspector')).getByText(
        'Investigate launch comment thread',
      ),
    ).toBeInTheDocument();
  });

  it('surfaces the linked report thread for completed task reviews', async () => {
    listMock.mockResolvedValue([
      buildTask({
        id: 'task-report-1',
        linkedRunIds: ['run-1'],
        reviewState: 'approved',
        status: 'completed',
        title: 'TikTok trend report',
      }),
    ]);

    render(<WorkspacePageContent section="activity" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(
      screen.getByLabelText('Open details for TikTok trend report'),
    );

    await waitFor(() => {
      expect(getRunByIdMock).toHaveBeenCalledWith('run-1');
      expect(getRunContentMock).toHaveBeenCalledWith(
        'run-1',
        expect.any(AbortSignal),
      );
    });

    await waitFor(() => {
      expect(
        within(screen.getByTestId('workspace-task-inspector')).getByText(
          'Report threads: 1',
        ),
      ).toBeInTheDocument();
    });

    expect(
      within(screen.getByTestId('workspace-task-inspector')).getByRole('link', {
        name: 'Open Report',
      }),
    ).toHaveAttribute('href', '/chat/thread-report-123');
    expect(
      within(screen.getByTestId('workspace-task-inspector')).getByRole('link', {
        name: 'Open report thread',
      }),
    ).toHaveAttribute('href', '/chat/thread-report-123');
  });

  it('renders linked ingredient outputs inside the task inspector', async () => {
    listMock.mockResolvedValue([
      buildTask({
        id: 'task-output-1',
        linkedOutputIds: ['ingredient-1'],
        reviewState: 'approved',
        status: 'completed',
        title: 'Launch ingredient output',
      }),
    ]);

    render(<WorkspacePageContent section="activity" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(
      screen.getByLabelText('Open details for Launch ingredient output'),
    );

    await waitFor(() => {
      expect(findIngredientMock).toHaveBeenCalledWith('ingredient-1');
    });

    const inspector = screen.getByTestId('workspace-task-inspector');

    expect(
      within(inspector).getByText(
        'Linked ingredient outputs created for this task.',
      ),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByTestId('workspace-task-linked-outputs'),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText('Campaign Hook Pack'),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText('Hook variants for the campaign brief.'),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByRole('link', { name: 'Open library' }),
    ).toHaveAttribute('href', '/library/ingredients');
  });

  it('surfaces the linked issue deep-link inside the task inspector', async () => {
    listMock.mockResolvedValue([
      buildTask({
        id: 'task-issue-1',
        linkedIssueId: 'issue-1',
        reviewState: 'pending_approval',
        status: 'needs_review',
        title: 'Review linked issue',
      }),
    ]);

    render(<WorkspacePageContent section="inbox" defaultInboxView="unread" />);

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith({ limit: 24 });
    });

    fireEvent.click(
      screen.getByLabelText('Open details for Review linked issue'),
    );

    await waitFor(() => {
      expect(findIssueMock).toHaveBeenCalledWith('issue-1');
    });

    const inspector = screen.getByTestId('workspace-task-inspector');

    expect(
      within(inspector).getByRole('link', { name: 'Open Issue' }),
    ).toHaveAttribute('href', '/issues/GEN-42');
    expect(within(inspector).getByText('Issue: GEN-42')).toBeInTheDocument();
  });
});
