import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { TasksService } from '@services/management/tasks.service';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';

const agentFullPageSpy = vi.fn();
const getTokenMock = vi.fn();
const createFollowUpTasksMock = vi.fn();

type AgentChatStoreSnapshot = { activeThreadId: string | null };
type AgentChatStoreListener = (
  state: AgentChatStoreSnapshot,
  previousState: AgentChatStoreSnapshot,
) => void;

const storeListeners = new Set<AgentChatStoreListener>();

/**
 * Stand-in for the zustand conversation store. The shell promotes the route by
 * *subscribing* rather than reading in render, so the double has to replay a
 * real `activeThreadId` transition — not just hand back a value.
 */
function emitActiveThreadId(
  activeThreadId: string | null,
  previousActiveThreadId: string | null = null,
): void {
  for (const listener of storeListeners) {
    listener({ activeThreadId }, { activeThreadId: previousActiveThreadId });
  }
}

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: (props: Record<string, unknown>) => {
    agentFullPageSpy(props);
    return null;
  },
  useAgentChatStore: {
    subscribe: (listener: AgentChatStoreListener) => {
      storeListeners.add(listener);
      return () => storeListeners.delete(listener);
    },
  },
}));

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/test-org/~${path}`,
  }),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
  }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: vi.fn(() => false),
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

vi.mock('./agent-workspace-context', () => ({
  useAgentWorkspace: () => ({
    agentApiService: { kind: 'service' },
    completeOnboardingFlow: completeOnboardingFlowMock,
    handleOAuthConnect: handleOAuthConnectMock,
    isLoaded: true,
    isOnboarding: true,
  }),
}));

describe('AgentWorkspacePageShell', () => {
  beforeEach(() => {
    agentFullPageSpy.mockClear();
    pushMock.mockClear();
    replaceMock.mockClear();
    storeListeners.clear();
    getTokenMock.mockResolvedValue('authProvider-token');
    vi.mocked(resolveAuthToken).mockResolvedValue('api-token');
    createFollowUpTasksMock.mockResolvedValue([
      { id: 'task-1' },
      { id: 'task-2' },
    ]);
    vi.mocked(TasksService.getInstance).mockReturnValue({
      createChildTasks: createFollowUpTasksMock,
    } as unknown as ReturnType<typeof TasksService.getInstance>);
  });

  it('renders the shared shell container', () => {
    const { container } = render(<AgentWorkspacePageShell />);

    expect(container.firstChild).toHaveClass(
      'flex',
      'h-full',
      'min-h-0',
      'w-full',
      'flex-1',
      'flex-col',
      'overflow-hidden',
    );
  });

  it('passes workspace wiring through to AgentFullPage', () => {
    render(<AgentWorkspacePageShell threadId="thread-123" />);

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

  it('promotes the unthreaded route to the thread the first turn created', () => {
    render(<AgentWorkspacePageShell />);

    emitActiveThreadId('thread-created-1');

    expect(replaceMock).toHaveBeenCalledWith(
      '/test-org/~/agent/onboarding/thread-created-1',
    );
  });

  it('leaves a route that already carries its thread alone', () => {
    render(<AgentWorkspacePageShell threadId="thread-123" />);

    emitActiveThreadId('thread-created-1');

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('ignores store updates that do not change the active thread', () => {
    render(<AgentWorkspacePageShell />);

    // A title edit or status change republishes the same id — that is not a
    // navigation, and re-running `replace` would fight the router.
    emitActiveThreadId('thread-created-1', 'thread-created-1');

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('stays put when the store clears the active thread', () => {
    render(<AgentWorkspacePageShell />);

    emitActiveThreadId(null, 'thread-created-1');

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('routes billing actions to Credits in OSS mode', () => {
    render(<AgentWorkspacePageShell />);

    const props = agentFullPageSpy.mock.calls[0]?.[0] as {
      onNavigateToBilling: () => void;
    };
    props.onNavigateToBilling();

    expect(pushMock).toHaveBeenCalledWith('/test-org/~/settings/credits');
  });

  it('routes credit pack selection to Credits in OSS mode', () => {
    render(<AgentWorkspacePageShell />);

    const props = agentFullPageSpy.mock.calls[0]?.[0] as {
      onSelectCreditPack: (pack: { label: string }) => void;
    };
    props.onSelectCreditPack({ label: 'Pro' });

    expect(pushMock).toHaveBeenCalledWith(
      '/test-org/~/settings/credits?pack=pro',
    );
  });

  it('creates workspace follow-up tasks through the shared workspace service', async () => {
    render(<AgentWorkspacePageShell />);

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
