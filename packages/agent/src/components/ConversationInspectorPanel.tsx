import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineArrowsPointingOut } from 'react-icons/hi2';

/**
 * The conversation as an inspector drawer: the same thread the `/agent`
 * surface renders full-bleed, reachable from every other surface without
 * leaving it.
 *
 * Deliberately thin. `AgentChatContainer` is entirely store-driven, so the
 * drawer needs no thread loading of its own — it reads the active thread from
 * the shared conversation store and stays in sync with the full surface. Its
 * prompt bar portals itself into the shell's floating composer slot, so this
 * panel renders the transcript only; the composer at the bottom of the canvas
 * is its input.
 */
interface ConversationInspectorPanelProps {
  apiService: AgentApiService;
  /**
   * Deep link out to the full conversation surface. Omitted when the host has
   * nowhere to send the user — the drawer then stands alone.
   */
  onOpenConversation?: () => void;
}

export function ConversationInspectorPanel({
  apiService,
  onOpenConversation,
}: ConversationInspectorPanelProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {onOpenConversation ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1.5">
          <Button
            icon={<HiOutlineArrowsPointingOut className="size-3.5" />}
            onClick={onOpenConversation}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            Open full conversation
          </Button>
        </div>
      ) : null}

      <AgentChatContainer
        apiService={apiService}
        emptyStateTitle="Start a conversation"
        emptyStateDescription="Ask for help with what you are looking at — the thread follows you across the workspace."
        isStreaming
        isWideLayout={false}
        placeholder="Ask for help with content, review, or planning..."
      />
    </div>
  );
}
