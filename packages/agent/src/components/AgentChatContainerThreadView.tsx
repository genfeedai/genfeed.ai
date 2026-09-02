'use client';

import { AgentChatTimeline } from '@genfeedai/agent/components/AgentChatTimeline';
import { AgentConversationTurnNavigator } from '@genfeedai/agent/components/AgentConversationTurnNavigator';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentPlanReviewSection } from '@genfeedai/agent/components/AgentPlanReviewSection';
import { WorkflowPhaseProgressBar } from '@genfeedai/agent/components/WorkflowPhaseProgressBar';
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
import type { ReactElement, RefObject } from 'react';

export type AgentChatContainerThreadViewProps = {
  activeThreadTitle: string | null;
  activeUiAction: string | null;
  apiService: AgentApiService;
  followUpTaskMessage: string | null;
  highlightedMessageId: string | null;
  isBusy: boolean;
  isCreatingFollowUpTasks: boolean;
  isGenerating: boolean;
  isWideLayout: boolean;
  isReadOnly: boolean;
  isStreamingActive: boolean;
  isSubmittingInputRequest: boolean;
  isAtBottom: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onboardingMode: boolean;
  onApprovePlan: () => Promise<void>;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  onCopy: (content: string) => Promise<void>;
  onCreateFollowUpTasks: () => Promise<void>;
  onIngredientSelect: (ingredient: { id: string; title?: string }) => void;
  onOAuthConnect?: (platform: string) => void;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onRequestPlanChanges: (revisionNote: string) => Promise<void>;
  onRetry: (message: AgentChatMessageType) => Promise<void>;
  onRetryLastFailedRun: () => void | Promise<void>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
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
};

/**
 * Active (non-empty / onboarding) conversation column: scroll region,
 * plan review, timeline, input-request overlay, and jump-to-latest control.
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
  isWideLayout,
  isReadOnly,
  isStreamingActive,
  isSubmittingInputRequest,
  latestProposedPlan,
  messagesEndRef,
  onboardingMode,
  onApprovePlan,
  onBrandCreate,
  onCopy,
  onCreateFollowUpTasks,
  onIngredientSelect,
  onOAuthConnect,
  onRegenerate,
  onRequestPlanChanges,
  onRetry,
  onRetryLastFailedRun,
  onSelectCreditPack,
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
}: AgentChatContainerThreadViewProps): ReactElement {
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
      {isWideLayout ? (
        <AgentConversationTurnNavigator
          scrollContainerRef={scrollContainerRef}
          timeline={timeline}
        />
      ) : null}
      {pendingInputRequest && shouldShowInputRequestOverlay ? (
        <AgentInputRequestOverlay
          isSubmitting={isSubmittingInputRequest}
          onSubmit={onSubmitInputRequest}
          request={pendingInputRequest}
          variant={onboardingMode ? 'inline' : 'overlay'}
        />
      ) : null}
      {/* Scroll owns the full pane width so the scrollbar is flush to the
          window edge (Codex). Content re-centers on AGENT_CONVERSATION_TRACK. */}
      <div ref={scrollContainerRef} className={AGENT_CONVERSATION_SCROLL_CLASS}>
        <div
          className={cn(AGENT_CONVERSATION_TRACK_CLASS, 'space-y-1 pt-4')}
          data-composer-padding={String(composerTranscriptPaddingPx)}
          style={{ paddingBottom: composerTranscriptPaddingPx }}
        >
          {/* Thread title lives in the shell topbar — no second title chrome. */}
          {activeThreadTitle ? (
            <h2 className="sr-only">{activeThreadTitle}</h2>
          ) : null}

          <WorkflowPhaseProgressBar />

          {latestProposedPlan ? (
            <AgentPlanReviewSection
              plan={latestProposedPlan}
              isBusy={isBusy || isReadOnly}
              activeUiAction={activeUiAction}
              isCreatingFollowUpTasks={isCreatingFollowUpTasks}
              followUpTaskMessage={followUpTaskMessage}
              showFollowUpButton={showFollowUpButton && !isReadOnly}
              onApprove={onApprovePlan}
              onRequestChanges={onRequestPlanChanges}
              onCreateFollowUpTasks={onCreateFollowUpTasks}
            />
          ) : null}

          <AgentChatTimeline
            timeline={timeline}
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
            onSelectCreditPack={onSelectCreditPack}
            onSelectIngredient={onIngredientSelect}
            onUiAction={onUiAction}
            hasDockedGenerationCard={hasDockedGenerationCard}
            // Docked composer status owns busy chrome — hide pure Thinking rows.
            suppressThinkingPlaceholder={padBottomForComposer}
          />
        </div>
      </div>

      {!isAtBottom ? (
        <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 md:bottom-28">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            icon={<ArrowDown className="size-4" />}
            ariaLabel="Scroll to latest message"
            className="rounded-md border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
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
