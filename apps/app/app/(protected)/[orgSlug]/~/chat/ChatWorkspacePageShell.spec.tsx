import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { TasksService } from '@services/management/tasks.service';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspacePageShell } from './ChatWorkspacePageShell';

const agentFullPageSpy = vi.fn();
const getTokenMock = vi.fn();
const createFollowUpTasksMock = vi.fn();

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: (props: Record<string, unknown>) => {
    agentFullPageSpy(props);
    return null;
  },
}));

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
  }),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: vi.fn(),
}));

vi.mock('@/lib/config/edition', () => ({
  isEEEnabled: vi.fn(() => false),
}));

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

const completeOnboardingFlowMock = vi.fn();
const handleOAuthConnectMock = vi.fn();

vi.mock('./chat-workspace-context', () => ({
  useChatWorkspace: () => ({
    agentApiService: { kind: 'service' },
    completeOnboardingFlow: completeOnboardingFlowMock,
    handleOAuthConnect: handleOAuthConnectMock,
    isLoaded: true,
    isOnboarding: true,
  }),
}));

describe('ChatWorkspacePageShell', () => {
  beforeEach(() => {
    agentFullPageSpy.mockClear();
    pushMock.mockClear();
    getTokenMock.mockResolvedValue('clerk-token');
    vi.mocked(resolveClerkToken).mockResolvedValue('api-token');
    createFollowUpTasksMock.mockResolvedValue([
      { id: 'task-1' },
      { id: 'task-2' },
    ]);
    vi.mocked(TasksService.getInstance).mockReturnValue({
      createChildTasks: createFollowUpTasksMock,
    } as unknown as ReturnType<typeof TasksService.getInstance>);
  });

  it('renders the shared shell container', () => {
    const { container } = render(<ChatWorkspacePageShell />);

    expect(container.firstChild).toHaveClass(
      'flex',
      'min-h-[calc(100vh-4rem)]',
      'flex-1',
      'flex-col',
    );
  });

  it('passes workspace wiring through to AgentFullPage', () => {
    render(<ChatWorkspacePageShell threadId="thread-123" />);

    expect(agentFullPageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiService: { kind: 'service' },
        authReady: true,
        onboardingMode: true,
        onOAuthConnect: handleOAuthConnectMock,
        onOnboardingCompleted: completeOnboardingFlowMock,
        showThreadSidebar: false,
        threadId: 'thread-123',
      }),
    );
  });

  it('routes billing actions to api keys in OSS mode', () => {
    render(<ChatWorkspacePageShell />);

    const props = agentFullPageSpy.mock.calls[0]?.[0] as {
      onNavigateToBilling: () => void;
    };
    props.onNavigateToBilling();

    expect(pushMock).toHaveBeenCalledWith('/settings/organization/api-keys');
  });

  it('routes credit pack selection to api keys in OSS mode', () => {
    render(<ChatWorkspacePageShell />);

    const props = agentFullPageSpy.mock.calls[0]?.[0] as {
      onSelectCreditPack: (pack: { label: string }) => void;
    };
    props.onSelectCreditPack({ label: 'Pro' });

    expect(pushMock).toHaveBeenCalledWith('/settings/organization/api-keys');
  });

  it('creates workspace follow-up tasks through the shared workspace service', async () => {
    render(<ChatWorkspacePageShell />);

    const props = agentFullPageSpy.mock.calls[0]?.[0] as {
      onCreateFollowUpTasks: (
        taskId: string,
      ) => Promise<{ createdCount: number }>;
    };

    await expect(
      props.onCreateFollowUpTasks('workspace-task-1'),
    ).resolves.toEqual({
      createdCount: 2,
    });

    expect(createFollowUpTasksMock).toHaveBeenCalledWith('workspace-task-1');
  });
});
