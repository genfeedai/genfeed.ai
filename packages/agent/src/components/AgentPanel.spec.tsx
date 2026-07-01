import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockToggleOpen = vi.fn();
const socketMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));
const xtermMocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  fit: vi.fn(),
  focus: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  open: vi.fn(),
  reset: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'test-brand',
    orgSlug: 'test-org',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/test-org/test-brand${path}`,
  }),
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connected: false,
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: socketMocks.on,
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({
    fit: xtermMocks.fit,
  })),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    cols: 120,
    dispose: xtermMocks.dispose,
    focus: xtermMocks.focus,
    loadAddon: xtermMocks.loadAddon,
    onData: xtermMocks.onData,
    open: xtermMocks.open,
    reset: xtermMocks.reset,
    rows: 32,
    write: xtermMocks.write,
    writeln: xtermMocks.writeln,
  })),
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeTerminalSessionByThread: {},
      activeThreadId: 'thread-123',
      addTerminalSession: vi.fn(),
      clearComposerSeed: vi.fn(),
      composerSeed: null,
      creditsRemaining: 42,
      isOpen: true,
      messages: [],
      pageContext: null,
      removeTerminalSession: vi.fn(),
      seedComposer: vi.fn(),
      setActiveTerminalSession: vi.fn(),
      setCreditsRemaining: vi.fn(),
      setModelCosts: vi.fn(),
      setTerminalSessionsByThread: vi.fn(),
      socketConnectionState: 'connected',
      terminalSessionsByThread: new Map(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders the terminal rail without the embedded chat composer toggle', () => {
    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    expect(screen.getByTestId('agent-cli-terminal')).toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-chat-container'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Switch to chat mode'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('genfeed')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Open full agent workspace'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Terminal working directory'),
    ).toBeInTheDocument();
  });

  it('persists the terminal working directory locally', () => {
    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    fireEvent.change(screen.getByLabelText('Terminal working directory'), {
      target: { value: '/home/testuser/projects/genfeed' },
    });
    fireEvent.blur(screen.getByLabelText('Terminal working directory'));

    expect(window.localStorage.getItem('genfeed:terminal:cwd')).toBe(
      '/home/testuser/projects/genfeed',
    );
  });

  it('restores the persisted terminal working directory', () => {
    window.localStorage.setItem('genfeed:terminal:cwd', '/tmp/genfeed');

    render(<AgentPanel apiService={createCreditsInfoApiService() as never} />);

    expect(screen.getByLabelText('Terminal working directory')).toHaveValue(
      '/tmp/genfeed',
    );
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

    screen.getByLabelText('Open full agent workspace').click();

    expect(mockPush).toHaveBeenCalledWith(
      '/test-org/test-brand/agent/thread-123',
    );
  });
});
