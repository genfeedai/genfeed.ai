import {
  AgentChatMessage,
  UiActionRenderer,
} from '@genfeedai/agent/components/AgentChatMessage';
import { AgentRunFailureCard } from '@genfeedai/agent/components/AgentRunFailureCard';
import { AnimatedStatusText } from '@genfeedai/agent/components/AnimatedStatusText';
import { TimelineStreamingRow } from '@genfeedai/agent/components/TimelineStreamingRow';
import { TimelineWorkGroup } from '@genfeedai/agent/components/TimelineWorkGroup';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import type { ReactElement, RefObject } from 'react';

type TimelineTurnGroup = {
  id: string;
  items: { entry: TimelineEntry; index: number }[];
};

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
  onRetryLastFailedRun?: () => void | Promise<void>;
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
  onUiAction: AgentUiActionHandler;
  isReadOnly?: boolean;
  /**
   * When true, pure "Thinking" placeholders are suppressed — composer status
   * (or a live streaming row) already owns busy chrome (T3 density).
   */
  suppressThinkingPlaceholder?: boolean;
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
  onRetryLastFailedRun,
  onOAuthConnect,
  onBrandCreate,
  onSelectCreditPack,
  onSelectIngredient,
  onUiAction,
  isReadOnly = false,
  suppressThinkingPlaceholder = true,
}: AgentChatTimelineProps): ReactElement {
  // Only the terminal timeline entry may own the failure card / retry context.
  // An older failed work-group must not surface when a later group succeeded
  // or when the terminal entry is a message / stream row.
  // Intermediate tool failures that were recovered (later tools completed)
  // must not keep the failure card up either.
  const terminalEntry = timeline.at(-1);
  const terminalFailedWorkGroup =
    terminalEntry?.kind === 'work-group'
      ? (() => {
          const toolEvents = terminalEntry.events.filter(
            (event) =>
              event.status === AgentWorkEventStatus.FAILED ||
              event.status === AgentWorkEventStatus.COMPLETED ||
              event.status === AgentWorkEventStatus.CANCELLED,
          );
          const last = toolEvents.at(-1);
          return last?.status === AgentWorkEventStatus.FAILED
            ? terminalEntry
            : null;
        })()
      : null;
  const lastFailedDetail = terminalFailedWorkGroup
    ? [...terminalFailedWorkGroup.events]
        .reverse()
        .find((event) => event.status === AgentWorkEventStatus.FAILED)?.detail
    : null;
  const isTerminalFailedRunWithoutAssistant =
    Boolean(terminalFailedWorkGroup) && !isGenerating && !isStreamingActive;

  const renderTimelineEntry = (
    entry: TimelineEntry,
    index: number,
  ): ReactElement | null => {
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
            isReadOnly={isReadOnly}
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
  };

  // Cursor-style turns: each user message opens a turn containing everything
  // until the next user message. The turn wrapper is the sticky containing
  // block, so the user prompt pins to the top of the viewport while its
  // response scrolls under it, and unpins when the next turn scrolls in.
  const turns: TimelineTurnGroup[] = [];
  timeline.forEach((entry, index) => {
    if (entry.kind === 'user-message' || turns.length === 0) {
      turns.push({ id: entry.id, items: [] });
    }
    turns[turns.length - 1].items.push({ entry, index });
  });

  return (
    <>
      {turns.map((turn) => (
        <div key={turn.id} className="relative">
          {turn.items.map(({ entry, index }) =>
            renderTimelineEntry(entry, index),
          )}
        </div>
      ))}

      {isTerminalFailedRunWithoutAssistant ? (
        <AgentRunFailureCard
          error={lastFailedDetail}
          isRetrying={isBusy}
          onRetry={isReadOnly ? undefined : onRetryLastFailedRun}
        />
      ) : null}

      {pendingUiActions.length > 0 &&
        pendingUiActions
          .filter((action) => action.type !== 'generation_action_card')
          // Avoid a live pending analytics card stacking on the same card
          // already rendered from an assistant message in this thread.
          .filter((action) => {
            if (
              action.type !== 'analytics_snapshot_card' &&
              action.type !== 'completion_summary_card'
            ) {
              return true;
            }
            const pendingKey = action.id?.startsWith('analytics-snapshot:')
              ? action.id
              : `${action.type}:${action.title ?? ''}`;
            return !timeline.some(
              (entry) =>
                entry.kind === 'assistant-message' &&
                (entry.message.metadata?.uiActions ?? []).some((existing) => {
                  const existingKey = existing.id?.startsWith(
                    'analytics-snapshot:',
                  )
                    ? existing.id
                    : `${existing.type}:${existing.title ?? ''}`;
                  return existingKey === pendingKey;
                }),
            );
          })
          .map((action) => (
            <UiActionRenderer
              key={`pending-ui-action-${action.id}`}
              action={action}
              apiService={apiService}
              isReadOnly={isReadOnly}
              onCopy={onCopy}
              onOAuthConnect={onOAuthConnect}
              onBrandCreate={onBrandCreate}
              onSelectCreditPack={onSelectCreditPack}
              onSelectIngredient={onSelectIngredient}
              onUiAction={onUiAction}
            />
          ))}

      {/* Composer status stack owns busy chrome when docked; only show a
          timeline Thinking row when that path is unavailable. */}
      {isGenerating &&
        !suppressThinkingPlaceholder &&
        !isStreamingActive &&
        !timeline.some((e) => e.kind === 'streaming') && (
          <div className="flex min-w-0 items-center gap-2.5 py-2">
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
