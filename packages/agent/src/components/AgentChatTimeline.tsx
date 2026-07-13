import {
  AgentChatMessage,
  UiActionRenderer,
} from '@genfeedai/agent/components/AgentChatMessage';
import { AnimatedStatusText } from '@genfeedai/agent/components/AnimatedStatusText';
import { TimelineStreamingRow } from '@genfeedai/agent/components/TimelineStreamingRow';
import { TimelineWorkGroup } from '@genfeedai/agent/components/TimelineWorkGroup';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import type { ReactElement, RefObject } from 'react';

type AgentChatTimelineProps = {
  timeline: TimelineEntry[];
  pendingUiActions: AgentUiAction[];
  isGenerating: boolean;
  isStreamingActive: boolean;
  isBusy: boolean;
  highlightedMessageId: string | null;
  apiService: AgentApiService;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onCopy: (content: string) => Promise<void>;
  onRetry: (message: AgentChatMessageType) => Promise<void>;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSelectIngredient: (ingredient: { id: string; title?: string }) => void;
  onUiAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
};

export function AgentChatTimeline({
  timeline,
  pendingUiActions,
  isGenerating,
  isStreamingActive,
  isBusy,
  highlightedMessageId,
  apiService,
  messagesEndRef,
  onCopy,
  onRetry,
  onRegenerate,
  onOAuthConnect,
  onBrandCreate,
  onSelectCreditPack,
  onSelectIngredient,
  onUiAction,
}: AgentChatTimelineProps): ReactElement {
  return (
    <>
      {timeline.map((entry, index) => {
        switch (entry.kind) {
          case 'user-message':
          case 'assistant-message':
            return (
              <AgentChatMessage
                key={entry.id}
                messageIndex={index}
                message={entry.message}
                messageAnchorId={`agent-message-${entry.message.id}`}
                isHighlighted={highlightedMessageId === entry.message.id}
                isBusy={isBusy}
                apiService={apiService}
                onCopy={onCopy}
                onRetry={onRetry}
                onRegenerate={onRegenerate}
                onOAuthConnect={onOAuthConnect}
                onBrandCreate={onBrandCreate}
                onSelectCreditPack={onSelectCreditPack}
                onSelectIngredient={onSelectIngredient}
                onUiAction={onUiAction}
              />
            );
          case 'work-group':
            return <TimelineWorkGroup key={entry.id} entry={entry} />;
          case 'streaming':
            return <TimelineStreamingRow key={entry.id} entry={entry} />;
          default:
            return null;
        }
      })}

      {pendingUiActions.length > 0 &&
        pendingUiActions.map((action) => (
          <UiActionRenderer
            key={`pending-ui-action-${action.id}`}
            action={action}
            apiService={apiService}
            onCopy={onCopy}
            onOAuthConnect={onOAuthConnect}
            onBrandCreate={onBrandCreate}
            onSelectCreditPack={onSelectCreditPack}
            onSelectIngredient={onSelectIngredient}
            onUiAction={onUiAction}
          />
        ))}

      {isGenerating &&
        !isStreamingActive &&
        !timeline.some((e) => e.kind === 'streaming') && (
          <div className="flex items-center gap-2.5 py-4">
            <AnimatedStatusText
              text="Thinking"
              className="text-xs text-muted-foreground"
            />
          </div>
        )}
      <div ref={messagesEndRef} />
    </>
  );
}
