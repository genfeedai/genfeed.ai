import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import type { ReactElement } from 'react';

/**
 * The conversation as an inspector drawer: the same thread the `/agent`
 * surface renders full-bleed, reachable from every other surface without
 * leaving it.
 *
 * Deliberately thin. `AgentChatContainer` is entirely store-driven, so the
 * drawer needs no thread loading of its own — it reads the active thread from
 * the shared conversation store and stays in sync with the full surface. Its
 * prompt bar portals itself into the inspector's composer slot, keeping the
 * transcript and its input together without covering the active canvas.
 *
 * Expand-to-full lives in the shell inspector header (one chrome row), not a
 * second bar stacked above the transcript.
 *
 * Route-aware suggested actions come from `pageContext` (set by
 * `useAgentPageContext` on each app surface) so the empty rail shows
 * contextual cards, not only generic copy.
 */
interface ConversationInspectorPanelProps {
  apiService: AgentApiService;
  /**
   * Kept for host API stability. Expand-to-full is owned by the shell header.
   */
  onOpenConversation?: () => void;
}

export function ConversationInspectorPanel({
  apiService,
}: ConversationInspectorPanelProps): ReactElement {
  const pageContext = useAgentChatStore((state) => state.pageContext);
  const suggestedActions = pageContext?.suggestedActions ?? [];
  const placeholder =
    pageContext?.placeholder?.trim() || 'Ask about this page...';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentChatContainer
        apiService={apiService}
        emptyStateDescription="Ask about this page."
        emptyStateTitle="Start a conversation"
        isStreaming
        isWideLayout={false}
        placeholder={placeholder}
        suggestedActions={suggestedActions}
      />
    </div>
  );
}
