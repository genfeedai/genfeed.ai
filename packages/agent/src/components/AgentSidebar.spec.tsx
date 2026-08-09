import { AgentSidebar } from '@genfeedai/agent/components/AgentSidebar';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The transcript itself is covered by its own suite; stub it so this spec
// stays about the sidebar shell and its open/close wiring.
vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: () => <div data-testid="chat-container" />,
}));

const apiService = {} as AgentApiService;

describe('AgentSidebar', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({ isOpen: false });
  });

  it('renders only the launcher while closed', () => {
    render(<AgentSidebar apiService={apiService} />);

    expect(
      screen.getByRole('button', { name: 'Open agent' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('chat-container')).not.toBeInTheDocument();
  });

  it('opens the panel from the launcher', () => {
    render(<AgentSidebar apiService={apiService} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open agent' }));

    expect(screen.getByTestId('chat-container')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close agent' }),
    ).toBeInTheDocument();
  });

  it('closes from the panel header', () => {
    useAgentChatStore.setState({ isOpen: true });
    render(<AgentSidebar apiService={apiService} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByTestId('chat-container')).not.toBeInTheDocument();
    expect(useAgentChatStore.getState().isOpen).toBe(false);
  });

  it('closes from the launcher when already open', () => {
    useAgentChatStore.setState({ isOpen: true });
    render(<AgentSidebar apiService={apiService} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close agent' }));

    expect(useAgentChatStore.getState().isOpen).toBe(false);
  });
});
