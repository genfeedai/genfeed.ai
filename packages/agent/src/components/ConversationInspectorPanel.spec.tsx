import { ConversationInspectorPanel } from '@genfeedai/agent/components/ConversationInspectorPanel';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedProps {
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  isWideLayout?: boolean;
  placeholder?: string;
  suggestedActions?: unknown[];
}

const captured: { current: CapturedProps | null } = { current: null };

// The transcript has its own suite; capture the props the drawer hands it.
vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: (props: CapturedProps) => {
    captured.current = props;
    return <div data-testid="chat-container" />;
  },
}));

const apiService = {} as AgentApiService;

describe('ConversationInspectorPanel', () => {
  beforeEach(() => {
    captured.current = null;
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('renders the shared transcript in a narrow layout', () => {
    render(<ConversationInspectorPanel apiService={apiService} />);

    expect(screen.getByTestId('chat-container')).toBeInTheDocument();
    expect(captured.current?.isWideLayout).toBe(false);
    expect(captured.current?.emptyStateTitle).toBe('Start a conversation');
  });

  it('falls back to a generic placeholder with no page context', () => {
    render(<ConversationInspectorPanel apiService={apiService} />);

    expect(captured.current?.placeholder).toBe('Ask about this page...');
    expect(captured.current?.suggestedActions).toEqual([]);
  });

  it('uses the page context placeholder and suggestions', () => {
    const suggestedActions = [{ label: 'Summarize', prompt: 'Summarize' }];
    useAgentChatStore.setState({
      pageContext: {
        placeholder: 'Ask about analytics...',
        route: '/analytics',
        suggestedActions,
      },
    });

    render(<ConversationInspectorPanel apiService={apiService} />);

    expect(captured.current?.placeholder).toBe('Ask about analytics...');
    expect(captured.current?.suggestedActions).toEqual(suggestedActions);
  });

  it('ignores a blank page-context placeholder', () => {
    useAgentChatStore.setState({
      pageContext: {
        placeholder: '   ',
        route: '/analytics',
        suggestedActions: [],
      },
    });

    render(<ConversationInspectorPanel apiService={apiService} />);

    expect(captured.current?.placeholder).toBe('Ask about this page...');
  });
});
