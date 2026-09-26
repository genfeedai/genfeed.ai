import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { TasksService } from '@services/management/tasks.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );

  return {
    useTranslations: () => translateFromCatalog('common.agent.onboardingShell'),
  };
});

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => null,
}));

const agentFullPageSpy = vi.fn();
const getTokenMock = vi.fn();
const createFollowUpTasksMock = vi.fn();

const agentChatState = {
  activeThreadId: null as string | null,
  threads: [] as Array<{ brandId?: string | null; id: string }>,
};
let composerShellBrandId: string | undefined;

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: (props: Record<string, unknown>) => {
    agentFullPageSpy(props);
    return null;
  },
  useAgentChatStore: (selector: (state: typeof agentChatState) => unknown) =>
    selector(agentChatState),
  useConversationComposerShell: () =>
    composerShellBrandId ? { brandId: composerShellBrandId } : null,
}));

vi.mock(
  '@pages/library/knowledge/components/KnowledgeReferenceSection',
  () => ({
    default: () => null,
  }),
);

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
    agentChatState.activeThreadId = null;
    agentChatState.threads = [];
    composerShellBrandId = undefined;
    completeOnboardingFlowMock.mockReset();
    completeOnboardingFlowMock.mockResolvedValue(undefined);
    pushMock.mockClear();
    replaceMock.mockClear();
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

  it('finishes onboarding before opening the workspace without a social connection', async () => {
    render(<AgentWorkspacePageShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to workspace' }));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/test-org/~/workspace'),
    );
    expect(completeOnboardingFlowMock).toHaveBeenCalledTimes(1);
    expect(handleOAuthConnectMock).not.toHaveBeenCalled();
  });

  it('keeps skip retryable when completing setup fails', async () => {
    completeOnboardingFlowMock.mockRejectedValueOnce(
      new Error('Network error'),
    );
    render(<AgentWorkspacePageShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not finish setup',
    );
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to workspace' }));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/test-org/~/workspace'),
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

  it('mounts the Knowledge section for the brand the next turn runs under', () => {
    composerShellBrandId = 'brand-composer';
    agentChatState.activeThreadId = 'thread-1';
    agentChatState.threads = [{ brandId: 'brand-thread', id: 'thread-1' }];
    render(<AgentWorkspacePageShell threadId="thread-1" />);

    const props = agentFullPageSpy.mock.lastCall?.[0] as {
      knowledgeSection: ReactElement<{ brandId?: string }>;
      knowledgeSelection: unknown;
    };
    expect(props.knowledgeSection.props.brandId).toBe('brand-composer');
    expect(props.knowledgeSelection).toEqual({});
  });

  it("falls back to the open thread's brand for the Knowledge section", () => {
    agentChatState.activeThreadId = 'thread-1';
    agentChatState.threads = [{ brandId: 'brand-thread', id: 'thread-1' }];
    render(<AgentWorkspacePageShell threadId="thread-1" />);

    const props = agentFullPageSpy.mock.lastCall?.[0] as {
      knowledgeSection: ReactElement<{ brandId?: string }>;
    };
    expect(props.knowledgeSection.props.brandId).toBe('brand-thread');
  });

  it('sends the picked Knowledge and drops it when the brand changes', () => {
    composerShellBrandId = 'brand-a';
    const { rerender } = render(<AgentWorkspacePageShell />);

    const initialProps = agentFullPageSpy.mock.lastCall?.[0] as {
      knowledgeSection: ReactElement<{
        onChange: (value: { sourceIds: string[] }) => void;
      }>;
    };
    const picker = initialProps.knowledgeSection;
    act(() => picker.props.onChange({ sourceIds: ['source-a'] }));

    expect(agentFullPageSpy.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        knowledgeSelection: { sourceIds: ['source-a'] },
      }),
    );

    composerShellBrandId = 'brand-b';
    rerender(<AgentWorkspacePageShell />);

    const props = agentFullPageSpy.mock.lastCall?.[0] as {
      knowledgeSection: ReactElement<{ brandId?: string }>;
      knowledgeSelection: unknown;
    };
    expect(props.knowledgeSection.props.brandId).toBe('brand-b');
    expect(props.knowledgeSelection).toEqual({});
  });
});
