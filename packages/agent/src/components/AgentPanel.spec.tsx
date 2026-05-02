import { render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockToggleOpen = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'test-brand',
    orgSlug: 'test-org',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeThreadId: 'thread-123',
      clearComposerSeed: vi.fn(),
      composerSeed: null,
      creditsRemaining: 42,
      isOpen: true,
      messages: [],
      pageContext: null,
      seedComposer: vi.fn(),
      setCreditsRemaining: vi.fn(),
      setModelCosts: vi.fn(),
      socketConnectionState: 'connected',
      threads: [],
      toggleOpen: mockToggleOpen,
    }),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        className={props.className}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: function MockAgentChatContainer(props: {
    promptBarLayoutMode?: string;
    onModelChange?: (model: string) => void;
  }) {
    return (
      <div
        data-testid="agent-chat-container"
        data-prompt-layout-mode={props.promptBarLayoutMode}
      >
        <button type="button" onClick={() => props.onModelChange?.('gpt-5')}>
          change model
        </button>
      </div>
    );
  },
}));

vi.mock('@genfeedai/agent/components/AgentOutputsPanel', () => ({
  AgentOutputsPanel: function MockAgentOutputsPanel() {
    return <div data-testid="agent-outputs-panel">outputs-panel</div>;
  },
}));

import { AgentPanel } from '@genfeedai/agent/components/AgentPanel';

function createCreditsInfoApiService() {
  const getCreditsInfo = vi.fn().mockResolvedValue({
    balance: 42,
    modelCosts: {},
  });

  const getInstallReadiness = vi.fn().mockResolvedValue({
    authMode: 'none',
    billingMode: 'oss_local',
    localTools: {
      anyDetected: true,
      claude: true,
      codex: true,
      detected: ['claude', 'codex'],
    },
    providers: {
      anyConfigured: true,
      configured: ['openai', 'replicate'],
      fal: false,
      imageGenerationReady: true,
      openai: true,
      replicate: true,
      textGenerationReady: true,
    },
    ui: {
      showBilling: false,
      showCloudUpgradeCta: false,
      showCredits: true,
      showPricing: false,
    },
    workspace: {
      brandId: null,
      hasBrand: false,
      hasOrganization: true,
      organizationId: 'org-1',
    },
  });

  return {
    getCreditsInfo,
    getCreditsInfoEffect: vi.fn((...args: Parameters<typeof getCreditsInfo>) =>
      Effect.promise(() => getCreditsInfo(...args)),
    ),
    getInstallReadiness,
    getInstallReadinessEffect: vi.fn(
      (...args: Parameters<typeof getInstallReadiness>) =>
        Effect.promise(() => getInstallReadiness(...args)),
    ),
    updateThreadEffect: vi.fn(() =>
      Effect.succeed({
        id: 'thread-123',
      }),
    ),
  };
}

describe('AgentPanel', () => {
  it('renders terminal chrome with the full workspace action', () => {
    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    expect(screen.getByTestId('agent-cli-terminal')).toBeInTheDocument();
    expect(screen.getByText('genfeed')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Open full chat workspace'),
    ).toBeInTheDocument();
  });

  it('shows the terminal runtime picker in local mode', async () => {
    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    await waitFor(() => {
      expect(screen.getByText('Runtime')).toBeInTheDocument();
    });

    expect(screen.getByText('local')).toBeInTheDocument();
  });

  it('renders outputs as a second rail tab', () => {
    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    expect(
      screen.getByRole('button', { name: 'Terminal' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outputs' })).toBeInTheDocument();
    expect(screen.getByTestId('agent-outputs-panel')).toBeInTheDocument();
  });

  it('does not request credits until the panel becomes active on non-agent routes', async () => {
    const apiService = createCreditsInfoApiService();

    const { rerender } = render(
      <AgentPanel apiService={apiService as never} isActive={false} />,
    );

    await waitFor(() => {
      expect(apiService.getCreditsInfo).not.toHaveBeenCalled();
    });

    rerender(<AgentPanel apiService={apiService as never} isActive />);

    await waitFor(() => {
      expect(apiService.getCreditsInfo).toHaveBeenCalledTimes(1);
    });
  });

  it('opens the active thread in the full workspace', () => {
    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    screen.getByLabelText('Open full chat workspace').click();

    expect(mockPush).toHaveBeenCalledWith(
      '/test-org/test-brand/chat/thread-123',
    );
  });
});
