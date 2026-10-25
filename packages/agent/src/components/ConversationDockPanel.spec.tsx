import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { ConversationDockPanel } from '@genfeedai/agent/components/ConversationDockPanel';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { MemberRole } from '@genfeedai/contracts';
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

// The transcript has its own suite; capture the props the dock hands it.
vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: (props: CapturedProps) => {
    captured.current = props;
    return <div data-testid="chat-container" />;
  },
}));

const apiService = {} as AgentApiService;

describe('ConversationDockPanel', () => {
  beforeEach(() => {
    captured.current = null;
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('renders the shared transcript in a narrow layout', () => {
    render(<ConversationDockPanel apiService={apiService} />);

    expect(screen.getByTestId('chat-container')).toBeInTheDocument();
    expect(captured.current?.isWideLayout).toBe(false);
    expect(captured.current?.emptyStateTitle).toBe('What do you want to do?');
  });

  it('falls back to a generic placeholder with no page context', () => {
    render(<ConversationDockPanel apiService={apiService} />);

    expect(captured.current?.placeholder).toBe('Describe a task...');
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

    render(<ConversationDockPanel apiService={apiService} />);

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

    render(<ConversationDockPanel apiService={apiService} />);

    expect(captured.current?.placeholder).toBe('Describe a task...');
  });
  it('prefers useful dock page actions while leaving personalized full-page actions intact', () => {
    const personalized = [
      { label: 'Create AI automation', prompt: 'Personalized prompt' },
    ];
    const dock = [{ label: 'Find an asset', prompt: 'Search the library' }];
    useAgentChatStore.setState({
      pageContext: {
        route: '/library',
        suggestedActions: personalized,
        dockSuggestedActions: dock,
      },
    });
    render(<ConversationDockPanel apiService={apiService} />);
    expect(captured.current?.suggestedActions).toEqual(dock);
    expect(useAgentChatStore.getState().pageContext?.suggestedActions).toEqual(
      personalized,
    );
  });

  it('follows actual shell selections rather than route suggestions', () => {
    useAgentChatStore.setState({
      pageContext: {
        route: '/library',
        memberRole: MemberRole.CREATOR,
        suggestedActions: [],
      },
    });
    render(
      <ConversationComposerShellProvider
        artifactReferences={[
          {
            kind: 'post',
            serializer: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
          },
        ]}
        contextLabel="Library"
        draftScopeKey={null}
        placement="dock"
        portalTarget={null}
        shellState="canvas"
      >
        <ConversationDockPanel apiService={apiService} />
      </ConversationComposerShellProvider>,
    );
    expect(captured.current?.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Draft a post' }),
      ]),
    );
    expect(captured.current?.suggestedActions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Write a caption' }),
      ]),
    );
  });
});
