import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * The conversation hosted in the bottom agent dock: the same thread the
 * `/agent` surface renders full-bleed, reachable from every other product
 * route without leaving it.
 *
 * Deliberately thin. `AgentChatContainer` is entirely store-driven, so the
 * dock needs no thread loading of its own — it reads the active thread from
 * the shared conversation store and stays in sync with the full surface. Its
 * prompt bar portals itself into the dock's composer slot, keeping the
 * transcript and its input together without covering the active canvas.
 *
 * Expand-to-full lives in the dock header (one chrome row), not a second bar
 * stacked above the transcript.
 *
 * Route-aware suggested actions come from `pageContext` (set by
 * `useAgentPageContext` on each app surface) so the empty rail shows
 * contextual cards, not only generic copy.
 */
interface ConversationDockPanelProps {
  apiService: AgentApiService;
}

export function ConversationDockPanel({
  apiService,
}: ConversationDockPanelProps): ReactElement {
  const translate = useTranslations('agent.dock');
  const pageContext = useAgentChatStore((state) => state.pageContext);
  const suggestedActions = pageContext?.suggestedActions ?? [];
  const placeholder =
    pageContext?.placeholder?.trim() || translate('placeholder');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentChatContainer
        apiService={apiService}
        emptyStateDescription={translate('emptyDescription')}
        emptyStateTitle={translate('emptyTitle')}
        isStreaming
        isWideLayout={false}
        placeholder={placeholder}
        suggestedActions={suggestedActions}
      />
    </div>
  );
}
