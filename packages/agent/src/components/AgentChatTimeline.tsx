import {
  AgentChatMessage,
  UiActionRenderer,
} from '@genfeedai/agent/components/AgentChatMessage';
import {
  AgentPlanCard,
  type AgentPlanDecision,
} from '@genfeedai/agent/components/AgentPlanCard';
import { AgentRunFailureCard } from '@genfeedai/agent/components/AgentRunFailureCard';
import { AnimatedStatusText } from '@genfeedai/agent/components/AnimatedStatusText';
import { TimelineStreamingRow } from '@genfeedai/agent/components/TimelineStreamingRow';
import { TimelineWorkGroup } from '@genfeedai/agent/components/TimelineWorkGroup';
import { AGENT_TIMELINE_DEFERRED_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentProposedPlan,
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { formatWorkDuration } from '@genfeedai/agent/utils/format-work-duration.util';
import {
  getTurnWorkDurationMs,
  groupTimelineTurns,
  splitCompletedTimelineTurn,
} from '@genfeedai/agent/utils/group-timeline-turns.util';
import { resolvePlanAnchors } from '@genfeedai/agent/utils/resolve-plan-anchors.util';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { useTranslations } from 'next-intl';
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useMemo,
} from 'react';

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
  /** #4670 Open in Studio: navigates to the ready-to-use Studio generate URL. */
  onOpenInStudio?: (studioUrl: string) => void;
  onSelectIngredient: (ingredient: { id: string; title?: string }) => void;
  onUiAction: AgentUiActionHandler;
  isReadOnly?: boolean;
  /**
   * When the composer is showing a generation card, that card owns the
   * generate failure. Do not also pin AgentRunFailureCard in the timeline.
   */
  hasDockedGenerationCard?: boolean;
  /**
   * When true, pure "Thinking" placeholders are suppressed — composer status
   * (or a live streaming row) already owns busy chrome (T3 density).
   */
  suppressThinkingPlaceholder?: boolean;
  /** The thread's current plan; its card sits under the message that proposed it. */
  latestProposedPlan?: AgentProposedPlan | null;
  /** Right-aligned actions on the current plan's card. */
  planActions?: ReactNode;
  /** Approve or revise the current plan from its own card. */
  planDecision?: AgentPlanDecision;
  planFooterMessage?: string | null;
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
  onOpenInStudio,
  onSelectIngredient,
  onUiAction,
  isReadOnly = false,
  hasDockedGenerationCard = false,
  suppressThinkingPlaceholder = true,
  latestProposedPlan = null,
  planActions,
  planDecision,
  planFooterMessage = null,
}: AgentChatTimelineProps): ReactElement {
  const translate = useTranslations('agent.timeline');
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
  const isTerminalFailureRetryable =
    isTerminalFailedRunWithoutAssistant &&
    formatAgentError(lastFailedDetail).isRetryable;
  const retryableUserEntry =
    isTerminalFailureRetryable && !hasDockedGenerationCard
      ? [...timeline]
          .slice(0, -1)
          .reverse()
          .find((entry) => entry.kind === 'user-message')
      : null;
  const retryableUserMessageId =
    retryableUserEntry?.kind === 'user-message'
      ? retryableUserEntry.message.id
      : null;

  const planAnchors = useMemo(
    () => resolvePlanAnchors(timeline, latestProposedPlan),
    [latestProposedPlan, timeline],
  );
  const renderPlanCard = (plan: AgentProposedPlan): ReactElement => {
    const isCurrentPlan = plan.id === latestProposedPlan?.id;
    return (
      <AgentPlanCard
        actions={isCurrentPlan ? planActions : undefined}
        decision={isCurrentPlan && !isReadOnly ? planDecision : undefined}
        footerMessage={isCurrentPlan ? planFooterMessage : null}
        plan={plan}
      />
    );
  };

  const renderTimelineEntry = (
    entry: TimelineEntry,
    index: number,
    isLiveTurn = false,
    isEmbedded = false,
  ): ReactElement | null => {
    switch (entry.kind) {
      case 'user-message':
      case 'assistant-message': {
        const anchoredPlan =
          entry.kind === 'assistant-message'
            ? planAnchors.byMessageId.get(entry.message.id)
            : undefined;
        return (
          <Fragment key={entry.id}>
            <AgentChatMessage
              messageIndex={index}
              message={entry.message}
              messageAnchorId={`agent-message-${entry.message.id}`}
              isHighlighted={highlightedMessageId === entry.message.id}
              isRetryableUserPrompt={
                entry.kind === 'user-message' &&
                entry.message.id === retryableUserMessageId
              }
              isBusy={isBusy}
              deferNextSteps={isLiveTurn}
              isReadOnly={isReadOnly}
              apiService={apiService}
              onCopy={onCopy}
              onRetry={onRetry}
              onRegenerate={onRegenerate}
              onOAuthConnect={onOAuthConnect}
              onBrandCreate={onBrandCreate}
              onOpenInStudio={onOpenInStudio}
              onSelectIngredient={onSelectIngredient}
              onUiAction={onUiAction}
            />
            {anchoredPlan ? renderPlanCard(anchoredPlan) : null}
          </Fragment>
        );
      }
      case 'work-group':
        return (
          <TimelineWorkGroup
            key={entry.id}
            entry={entry}
            isEmbedded={isEmbedded}
          />
        );
      case 'streaming':
        return <TimelineStreamingRow key={entry.id} entry={entry} />;
      default:
        return null;
    }
  };

  // `timeline` only changes identity when history or the stream row changes;
  // hooks below the turn grouping (highlight, busy flags) must not re-walk it.
  const turns = useMemo(() => groupTimelineTurns(timeline), [timeline]);

  return (
    <>
      {turns.map((turn, turnIndex) => {
        const isLiveTurn =
          turnIndex === turns.length - 1 &&
          (isBusy || isGenerating || isStreamingActive);
        const { activity, visible } = isLiveTurn
          ? { activity: [], visible: turn.items }
          : splitCompletedTimelineTurn(turn);
        const isActivityHighlighted = activity.some(
          ({ entry }) =>
            entry.kind === 'assistant-message' &&
            entry.message.id === highlightedMessageId,
        );
        const renderItem = (
          { entry, index }: (typeof turn.items)[number],
          isEmbedded = false,
        ) =>
          entry.kind === 'user-message' ? (
            renderTimelineEntry(entry, index, isLiveTurn)
          ) : (
            <div className={AGENT_TIMELINE_DEFERRED_CLASS} key={entry.id}>
              {renderTimelineEntry(entry, index, isLiveTurn, isEmbedded)}
            </div>
          );
        // A settled turn folds into one "Worked for …" disclosure: the steps
        // and the model's thinking live inside it, the result stays outside.
        const reasoning = isLiveTurn
          ? ''
          : turn.items
              .flatMap(({ entry }) =>
                entry.kind === 'assistant-message' &&
                entry.message.metadata?.reasoning?.trim()
                  ? [entry.message.metadata.reasoning.trim()]
                  : [],
              )
              .join('\n\n');
        const turnDurationMs = getTurnWorkDurationMs(turn);
        const workedFor =
          turnDurationMs != null && turnDurationMs >= 1000
            ? formatWorkDuration(turnDurationMs)
            : null;
        return (
          <div className="relative" key={turn.id}>
            {visible
              .filter(({ entry }) => entry.kind === 'user-message')
              .map((item) => renderItem(item))}
            {activity.length > 0 || reasoning ? (
              <Collapsible
                key={isActivityHighlighted ? 'highlighted' : 'settled'}
                defaultOpen={isActivityHighlighted}
              >
                <CollapsibleTrigger className="w-auto gap-2 py-2 text-xs text-muted-foreground">
                  {workedFor
                    ? translate('workedFor', { duration: workedFor })
                    : translate('worked')}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {reasoning ? (
                    <div className="py-1">
                      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                        {translate('thinking')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                        {reasoning}
                      </p>
                    </div>
                  ) : null}
                  {activity.map((item) => renderItem(item, true))}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {visible
              .filter(({ entry }) => entry.kind !== 'user-message')
              .map((item) => renderItem(item))}
          </div>
        );
      })}

      {planAnchors.trailing ? renderPlanCard(planAnchors.trailing) : null}

      {isTerminalFailedRunWithoutAssistant && !hasDockedGenerationCard ? (
        <AgentRunFailureCard
          error={lastFailedDetail}
          isRetrying={isBusy}
          onRetry={
            isReadOnly || !isTerminalFailureRetryable
              ? undefined
              : onRetryLastFailedRun
          }
        />
      ) : null}

      {pendingUiActions.length > 0 &&
        pendingUiActions
          // Avoid a live pending analytics card stacking on the same card
          // already rendered from an assistant message in this thread.
          .filter((action) => {
            if (
              action.type === 'next_steps_card' &&
              (isBusy || isGenerating || isStreamingActive)
            ) {
              return false;
            }
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
              isDisabled={isBusy}
              isReadOnly={isReadOnly}
              onCopy={onCopy}
              onOAuthConnect={onOAuthConnect}
              onBrandCreate={onBrandCreate}
              onOpenInStudio={onOpenInStudio}
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
