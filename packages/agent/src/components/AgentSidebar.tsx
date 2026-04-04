import { AgentChatContainer } from '@cloud/agent/components/AgentChatContainer';
import type { AgentChatMessage } from '@cloud/agent/models/agent-chat.model';
import type { AgentApiService } from '@cloud/agent/services/agent-api.service';
import { useAgentChatStore } from '@cloud/agent/stores/agent-chat.store';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import type { ReactElement } from 'react';

interface AgentSidebarProps {
  apiService: AgentApiService;
  onCopy?: (content: string) => void;
  onRegenerate?: (message: AgentChatMessage) => void;
}

export function AgentSidebar({
  apiService,
  onCopy,
  onRegenerate,
}: AgentSidebarProps): ReactElement | null {
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const toggleOpen = useAgentChatStore((s) => s.toggleOpen);

  return (
    <>
      {/* Toggle button */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label={isOpen ? 'Close agent' : 'Open agent'}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          )}
        </svg>
      </Button>

      {/* Sidebar panel */}
      {isOpen && (
        <aside className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Chat</h2>
            <div className="flex items-center gap-3">
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                onClick={toggleOpen}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            </div>
          </div>
          <AgentChatContainer
            apiService={apiService}
            isStreaming
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            promptBarLayoutMode="surface-fixed"
          />
        </aside>
      )}
    </>
  );
}
