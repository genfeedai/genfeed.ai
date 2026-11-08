'use client';

import { AgentChatTimeline } from '@genfeedai/agent/components/AgentChatTimeline';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import type { AgentPlanDecision } from '@genfeedai/agent/components/AgentPlanCard';
import { AgentWorkObjects } from '@genfeedai/agent/components/AgentWorkObjects';
import {
  AGENT_CONVERSATION_SCROLL_CLASS,
  AGENT_CONVERSATION_TRACK_CLASS,
} from '@genfeedai/agent/constants/conversation-layout.constant';
import {
  type AgentChatMessage as AgentChatMessageType,
  type AgentInputRequest,
  type AgentProposedPlan,
  type AgentUiAction,
  type AgentUiActionHandler,
  type AgentWorkEvent,
  AgentWorkEventStatus,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode, RefObject } from 'react';

export type AgentChatContainerThreadViewProps = {
  activeThreadTitle: string | null;
  activeUiAction: string | null;
  apiService: AgentApiService;
  followUpTaskMessage: string | null;
  highlightedMessageId: string | null;
  isBusy: boolean;
  isCreatingFollowUpTasks: boolean;
  isGenerating: boolean;
  isReadOnly: boolean;
  isStreamingActive: boolean;
  isSubmittingInputRequest: boolean;
  isAtBottom: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  onCopy: (content: string) => Promise<void>;
  onCreateFollowUpTasks: () => Promise<void>;
  onIngredientSelect: (ingredient: { id: string; title?: string }) => void;
  onOAuthConnect?: (platform: string) => void;
  /** #4670 Open in Studio: navigates to the ready-to-use Studio generate URL. */
  onOpenInStudio?: (studioUrl: string) => void;
  /** Approve or revise the current plan from its card. */
  planDecision?: AgentPlanDecision;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onRetry: (message: AgentChatMessageType) => Promise<void>;
  onRetryLastFailedRun: () => void | Promise<void>;
  onSubmitInputRequest: (
    answer: string,
    optionIds?: string[],
  ) => void | Promise<void>;
  onUiAction: AgentUiActionHandler;
  padBottomForComposer: boolean;
  composerTranscriptPaddingPx: number;
  pendingInputRequest: AgentInputRequest | null;
  pendingUiActions: AgentUiAction[];
  hasDockedGenerationCard?: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
  shouldShowInputRequestOverlay: boolean;
  showFollowUpButton: boolean;
  timeline: TimelineEntry[];
  /**
   * Composer under the transcript, anchored at the bottom of the column and
   * outside the transcript's scroll.
   */
  columnFooter?: ReactNode;
};

/**
 * Active (non-empty) conversation column: scroll region,
 * timeline, input-request overlay, and jump-to-latest control.
 */
export function AgentChatContainerThreadView({
  activeThreadTitle,
  activeUiAction,
  apiService,
  followUpTaskMessage,
  highlightedMessageId,
  isAtBottom,
  isBusy,
  isCreatingFollowUpTasks,
  isGenerating,
  isReadOnly,
  isStreamingActive,
  isSubmittingInputRequest,
  latestProposedPlan,
  messagesEndRef,
  onBrandCreate,
  onCopy,
  onCreateFollowUpTasks,
  onIngredientSelect,
  onOAuthConnect,
  onOpenInStudio,
  planDecision,
  onRegenerate,
  onRetry,
  onRetryLastFailedRun,
  onSubmitInputRequest,
  onUiAction,
  padBottomForComposer,
  composerTranscriptPaddingPx,
  pendingInputRequest,
  pendingUiActions,
  hasDockedGenerationCard = false,
  scrollContainerRef,
  scrollToBottom,
  shouldShowInputRequestOverlay,
  showFollowUpButton,
  timeline,
  columnFooter,
}: AgentChatContainerThreadViewProps): ReactElement {
  const translate = useTranslations('agent.threadView');
  const translatePlan = useTranslations('agent.plan');
  const planActions: ReactNode =
    showFollowUpButton && !isReadOnly ? (
      <Button
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
        onClick={() => {
          void onCreateFollowUpTasks();
        }}
        isDisabled={
          Boolean(activeUiAction) || isBusy || isCreatingFollowUpTasks
        }
        label={
          isCreatingFollowUpTasks
            ? translatePlan('creatingFollowUpTasks')
            : translatePlan('createFollowUpTasks')
        }
      />
    ) : null;
  const inputCard =
    pendingInputRequest && shouldShowInputRequestOverlay ? (
      <div>
        <AgentInputRequestOverlay
          isSubmitting={isSubmittingInputRequest}
          key={pendingInputRequest.inputRequestId}
          onSubmit={onSubmitInputRequest}
          request={pendingInputRequest}
          variant="inline"
        />
      </div>
    ) : null;
  return (
    <div
      className={cn(
        // min-w-0 is required on every flex ancestor — without it, wide
        // message/code/card min-content blows the column and paints a
        // horizontal scrollbar on the page (hiding overflow is not a fix).
        'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        isReadOnly && 'opacity-60',
      )}
    >
      {/* Scroll owns the full pane width so the scrollbar is flush to the
          window edge (Codex). Content re-centers on AGENT_CONVERSATION_TRACK. */}
      <div ref={scrollContainerRef} className={AGENT_CONVERSATION_SCROLL_CLASS}>
        <div
          className={cn(AGENT_CONVERSATION_TRACK_CLASS, 'grow space-y-1 pt-4')}
          data-composer-padding={String(composerTranscriptPaddingPx)}
          // The last row keeps a little air above the composer below it.
          style={{ paddingBottom: Math.max(composerTranscriptPaddingPx, 16) }}
        >
          {/* Thread title lives in the shell topbar — no second title chrome. */}
          {activeThreadTitle ? (
            <h2 className="sr-only">{activeThreadTitle}</h2>
          ) : null}
          {inputCard}

          <AgentWorkObjects apiService={apiService} isReadOnly={isReadOnly} />

          <AgentChatTimeline
            timeline={timeline}
            latestProposedPlan={latestProposedPlan}
            planActions={planActions}
            planDecision={planDecision}
            planFooterMessage={followUpTaskMessage}
            pendingUiActions={pendingUiActions}
            isGenerating={isGenerating}
            isStreamingActive={isStreamingActive}
            isBusy={isBusy}
            isReadOnly={isReadOnly}
            highlightedMessageId={highlightedMessageId}
            apiService={apiService}
            messagesEndRef={messagesEndRef}
            onCopy={onCopy}
            onRetry={onRetry}
            onRegenerate={onRegenerate}
            onRetryLastFailedRun={onRetryLastFailedRun}
            onOAuthConnect={onOAuthConnect}
            onBrandCreate={onBrandCreate}
            onOpenInStudio={onOpenInStudio}
            onSelectIngredient={onIngredientSelect}
            onUiAction={onUiAction}
            hasDockedGenerationCard={hasDockedGenerationCard}
            // Docked composer status owns busy chrome — hide pure Thinking rows.
            suppressThinkingPlaceholder={padBottomForComposer}
          />
        </div>
      </div>

      {columnFooter != null ? (
        // The composer is the column's footer, a sibling of the transcript
        // scroll: it stays anchored at the bottom whatever the transcript
        // holds (Claude desktop). Only the transcript above it scrolls.
        <div
          className="relative z-20 shrink-0 bg-background"
          data-testid="agent-column-composer"
        >
          {/* The transcript fades out above the footer instead of being sliced
              mid-line by its hard edge. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-gradient-to-t from-background to-transparent"
            data-testid="agent-transcript-fade"
          />
          {!isAtBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex justify-center pb-2">
              <Button
                ariaLabel={translate('scrollToLatest')}
                className="pointer-events-auto rounded-full border border-border/70 bg-background/90 text-foreground/80 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm"
                icon={<ArrowDown className="size-4" />}
                onClick={scrollToBottom}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </div>
          ) : null}
          {columnFooter}
        </div>
      ) : null}

      {!isAtBottom && !columnFooter ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
          style={{ bottom: composerTranscriptPaddingPx }}
        >
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            icon={<ArrowDown className="size-4" />}
            ariaLabel={translate('scrollToLatest')}
            className="pointer-events-auto rounded-full border border-border/70 bg-background/90 text-foreground/80 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm"
            withWrapper={false}
            onClick={scrollToBottom}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Prefer real tool/input work over stuck lifecycle bookends. */
export function selectActiveWorkEvent(
  workEvents: readonly AgentWorkEvent[],
  options?: { isStreamActive?: boolean },
): AgentWorkEvent | null {
  // Composer sticky "Tool started · Active" must not outlive the stream.
  if (options?.isStreamActive === false) {
    return null;
  }

  const pendingOrRunning = [...workEvents]
    .reverse()
    .filter(
      (event) =>
        event.status === AgentWorkEventStatus.PENDING ||
        event.status === AgentWorkEventStatus.RUNNING,
    );
  return (
    pendingOrRunning.find((event) =>
      Boolean(event.toolName || event.toolCallId),
    ) ??
    pendingOrRunning[0] ??
    null
  );
}
