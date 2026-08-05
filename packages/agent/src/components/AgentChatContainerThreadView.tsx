'use client';

import { AgentChatTimeline } from '@genfeedai/agent/components/AgentChatTimeline';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentPlanReviewSection } from '@genfeedai/agent/components/AgentPlanReviewSection';
import { OnboardingConversationCard } from '@genfeedai/agent/components/OnboardingConversationCard';
import { WorkflowPhaseProgressBar } from '@genfeedai/agent/components/WorkflowPhaseProgressBar';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentInputRequest,
  AgentProposedPlan,
  AgentUiAction,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ArrowDown } from 'lucide-react';
import type { ReactElement, RefObject } from 'react';

export type AgentChatContainerThreadViewProps = {
  activeThreadTitle: string | null;
  activeUiAction: string | null;
  apiService: AgentApiService;
  conversationColumnMaxWidthClass: string;
  followUpTaskMessage: string | null;
  highlightedMessageId: string | null;
  isBusy: boolean;
  isCreatingFollowUpTasks: boolean;
  isGenerating: boolean;
  isReadOnly: boolean;
  isStreamingActive: boolean;
  isSubmittingInputRequest: boolean;
  isEmpty: boolean;
  isAtBottom: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onboardingMode: boolean;
  onboardingSignupGiftCredits?: number;
  onboardingTotalJourneyCredits?: number;
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
  onSend: (prompt: string) => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
  onUiAction: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
  padBottomForComposer: boolean;
  pendingInputRequest: AgentInputRequest | null;
  pendingUiActions: AgentUiAction[];
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
  conversationColumnMaxWidthClass,
  followUpTaskMessage,
  highlightedMessageId,
  isAtBottom,
  isBusy,
  isCreatingFollowUpTasks,
  isEmpty,
  isGenerating,
  isReadOnly,
  isStreamingActive,
  isSubmittingInputRequest,
  latestProposedPlan,
  messagesEndRef,
  onboardingMode,
  onboardingSignupGiftCredits,
  onboardingTotalJourneyCredits,
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
  onSend,
  onSubmitInputRequest,
  onUiAction,
  padBottomForComposer,
  pendingInputRequest,
  pendingUiActions,
  scrollContainerRef,
  scrollToBottom,
  shouldShowInputRequestOverlay,
  showFollowUpButton,
  timeline,
}: AgentChatContainerThreadViewProps): ReactElement {
  return (
    <div
      className={cn(
        'relative flex flex-1 overflow-hidden',
        isReadOnly && 'opacity-60',
      )}
    >
      {pendingInputRequest && shouldShowInputRequestOverlay ? (
        <AgentInputRequestOverlay
          isSubmitting={isSubmittingInputRequest}
          onSubmit={onSubmitInputRequest}
          request={pendingInputRequest}
          variant={onboardingMode ? 'inline' : 'overlay'}
        />
      ) : null}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto space-y-1 p-4 md:px-6',
            // Floating/portaled composer overlays the transcript — pad so
            // the last turns can scroll clear of the frosted bar.
            padBottomForComposer ? 'pb-56 md:pb-72' : 'pb-6',
            conversationColumnMaxWidthClass,
          )}
        >
          {activeThreadTitle ? (
            <div className="mb-4 border-b border-border/50 px-1 pb-3">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground/85">
                {activeThreadTitle}
              </p>
            </div>
          ) : null}

          <WorkflowPhaseProgressBar />

          {latestProposedPlan ? (
            <AgentPlanReviewSection
              plan={latestProposedPlan}
              isBusy={isBusy}
              activeUiAction={activeUiAction}
              isCreatingFollowUpTasks={isCreatingFollowUpTasks}
              followUpTaskMessage={followUpTaskMessage}
              showFollowUpButton={showFollowUpButton}
              onApprove={onApprovePlan}
              onRequestChanges={onRequestPlanChanges}
              onCreateFollowUpTasks={onCreateFollowUpTasks}
            />
          ) : null}

          {isEmpty && onboardingMode ? (
            <div className="flex flex-col items-center px-2 pt-8 pb-4">
              <OnboardingConversationCard
                signupGiftCredits={onboardingSignupGiftCredits}
                totalJourneyCredits={onboardingTotalJourneyCredits}
                onStart={onSend}
                isDisabled={isBusy || isReadOnly}
              />
            </div>
          ) : null}

          <AgentChatTimeline
            timeline={timeline}
            pendingUiActions={pendingUiActions}
            isGenerating={isGenerating}
            isStreamingActive={isStreamingActive}
            isBusy={isBusy}
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
            className="rounded-full border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
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
      (event) => event.status === 'pending' || event.status === 'running',
    );
  return (
    pendingOrRunning.find((event) =>
      Boolean(event.toolName || event.toolCallId),
    ) ??
    pendingOrRunning[0] ??
    null
  );
}
