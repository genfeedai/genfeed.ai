import type { AgentApiService } from '@genfeedai/agent';
import { AgentPanel } from '@genfeedai/agent/components/AgentPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockSetCreditsRemaining = vi.fn();
const mockSetModelCosts = vi.fn();

const mockToggleOpen = vi.fn();

const storeState = {
  activeThreadId: null,
  clearComposerSeed: vi.fn(),
  clearMessages: vi.fn(),
  composerSeed: null,
  creditsRemaining: 123,
  isOpen: true,
  messages: [],
  pageContext: null as {
    placeholder?: string;
    suggestedActions?: unknown[];
  } | null,
  resetStreamState: vi.fn(),
  seedComposer: vi.fn(),
  setActiveRun: vi.fn(),
  setActiveThread: vi.fn(),
  setCreditsRemaining: mockSetCreditsRemaining,
  setError: vi.fn(),
  setMessages: vi.fn(),
  setModelCosts: mockSetModelCosts,
  setThreadPrompt: vi.fn(),
  setThreads: vi.fn(),
  setWorkEvents: vi.fn(),
  threads: [],
  toggleOpen: mockToggleOpen,
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => ({
    orgSlug: 'acme-org',
    brandSlug: 'brand-one',
  }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useOptionalUser: () => ({
    currentUser: {
      settings: {},
    },
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    selectedBrand: {
      organization: { slug: 'acme-org' },
      slug: 'brand-one',
    },
  }),
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: () => <div data-testid="agent-chat-container" />,
}));

vi.mock('@genfeedai/agent/components/AgentOutputsPanel', () => ({
  AgentOutputsPanel: () => <div data-testid="agent-outputs-panel" />,
}));

vi.mock('@genfeedai/agent/components/AgentCliTerminal', () => ({
  AgentCliTerminalBody: () => <div data-testid="agent-cli-terminal" />,
  AgentCliTerminalControls: () => (
    <div data-testid="agent-cli-terminal-controls" />
  ),
  useAgentCliTerminal: () => ({
    activeKind: 'shell',
    activeSessionId: null,
    containerRef: { current: null },
    cwdInput: '',
    isSearchOpen: false,
    killSession: () => undefined,
    searchQuery: '',
    sessions: [],
    setCwdInput: () => undefined,
    setSearchQuery: () => undefined,
    startSession: () => undefined,
    status: '',
    submitCwd: () => undefined,
    switchSession: () => undefined,
    toggleSearch: () => undefined,
  }),
}));

function renderAgentPanel(apiService: AgentApiService) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AgentPanel apiService={apiService} />
    </QueryClientProvider>,
  );
}

describe('AgentPanel', () => {
  it('fetches credits on mount and renders the terminal', async () => {
    const apiService = {
      getCreditsInfo: vi.fn().mockResolvedValue({
        balance: 123,
        modelCosts: {},
      }),
      getInstallReadiness: vi.fn().mockResolvedValue(null),
    } as unknown as AgentApiService;

    renderAgentPanel(apiService);

    await waitFor(() => {
      expect(apiService.getCreditsInfo).toHaveBeenCalledTimes(1);
    });

    expect(mockSetCreditsRemaining).toHaveBeenCalledWith(123);
    expect(mockSetModelCosts).toHaveBeenCalledWith({});

    // Default mode is CLI — AgentCliTerminal renders instead of AgentChatContainer
    expect(screen.getByTestId('agent-cli-terminal')).toBeInTheDocument();
    expect(screen.getByTestId('agent-outputs-panel')).toBeInTheDocument();
  });

  it('renders terminal toggle button that calls toggleOpen from store', async () => {
    const apiService = {
      getCreditsInfo: vi.fn().mockResolvedValue({
        balance: 123,
        modelCosts: {},
      }),
      getInstallReadiness: vi.fn().mockResolvedValue(null),
    } as unknown as AgentApiService;

    renderAgentPanel(apiService);

    await waitFor(() => {
      expect(apiService.getCreditsInfo).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByLabelText('Collapse terminal'));
    expect(mockToggleOpen).toHaveBeenCalledTimes(1);
  });
});
