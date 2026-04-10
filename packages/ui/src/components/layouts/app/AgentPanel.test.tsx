import type { AgentApiService } from '@genfeedai/agent';
import { AgentPanel } from '@genfeedai/agent/components/AgentPanel';
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
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useOptionalUser: () => ({
    currentUser: {
      settings: {
        defaultAgentModel: 'deepseek/deepseek-chat',
      },
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

describe('AgentPanel', () => {
  it('fetches credits on mount and renders chat container', async () => {
    const apiService = {
      getCreditsInfo: vi.fn().mockResolvedValue({
        balance: 123,
        modelCosts: {},
      }),
    } as unknown as AgentApiService;

    render(<AgentPanel apiService={apiService} />);

    await waitFor(() => {
      expect(apiService.getCreditsInfo).toHaveBeenCalledTimes(1);
    });

    expect(mockSetCreditsRemaining).toHaveBeenCalledWith(123);
    expect(mockSetModelCosts).toHaveBeenCalledWith({});

    expect(screen.getByTestId('agent-chat-container')).toBeInTheDocument();
    expect(screen.getByTestId('agent-outputs-panel')).toBeInTheDocument();
  });

  it('renders toggle button that calls toggleOpen from store', async () => {
    const apiService = {
      getCreditsInfo: vi.fn().mockResolvedValue({
        balance: 123,
        modelCosts: {},
      }),
    } as unknown as AgentApiService;

    render(<AgentPanel apiService={apiService} />);

    await waitFor(() => {
      expect(apiService.getCreditsInfo).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByLabelText('Collapse quick ask panel'));
    expect(mockToggleOpen).toHaveBeenCalledTimes(1);
  });
});
