import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
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
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentChatContainer
        apiService={apiService}
        emptyStateTitle="Start a conversation"
        emptyStateDescription="Ask about this page — the thread follows you."
        isStreaming
        isWideLayout={false}
        placeholder="Ask about this page..."
      />
    </div>
  );
}
