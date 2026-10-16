'use client';

import { AgentChatTimeline } from '@genfeedai/agent/components/AgentChatTimeline';
import { AgentConversationTurnNavigator } from '@genfeedai/agent/components/AgentConversationTurnNavigator';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentPlanReviewSection } from '@genfeedai/agent/components/AgentPlanReviewSection';
import { AgentWorkObjects } from '@genfeedai/agent/components/AgentWorkObjects';
import { OnboardingChoiceCards } from '@genfeedai/agent/components/OnboardingChoiceCards';
import { OnboardingSkipCard } from '@genfeedai/agent/components/OnboardingSkipCard';
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
import {
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

const ONBOARDING_HIDDEN_OPTION_IDS = ['skip'];

export type AgentChatContainerThreadViewProps = {
  activeThreadTitle: string | null;
  activeUiAction: string | null;
  apiService: AgentApiService;
  followUpTaskMessage: string | null;
  highlightedMessageId: string | null;
  isBusy: boolean;
  isCreatingFollowUpTasks: boolean;
  /** A review of the shown plan is awaiting its result; its controls lock. */
  isPlanReviewPending: boolean;
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
  /** #4670 Open in Studio: navigates to the ready-to-use Studio generate URL. */
  onOpenInStudio?: (studioUrl: string) => void;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onRequestPlanChanges: (revisionNote: string) => Promise<void>;
  onRetry: (message: AgentChatMessageType) => Promise<void>;
  onRetryLastFailedRun: () => void | Promise<void>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
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
   * Composer under the transcript. A settled thread keeps it in the scroll so
   * a short conversation stays in flow. Onboarding lifts it out of the scroll
   * and pins it to the column floor, with the choice cards directly above it.
   */
  columnFooter?: ReactNode;
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
  isPlanReviewPending,
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
  onOpenInStudio,
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
  columnFooter,
}: AgentChatContainerThreadViewProps): ReactElement {
  const inputCardRef = useRef<HTMLDivElement>(null);
  const columnFooterRef = useRef<HTMLDivElement>(null);
  const [hasContentBehindComposer, setHasContentBehindComposer] =
    useState(false);
  useEffect(() => {
    if (onboardingMode && pendingInputRequest?.inputRequestId)
      inputCardRef.current?.scrollIntoView?.({ block: 'end' });
  }, [onboardingMode, pendingInputRequest?.inputRequestId]);
  const hasColumnFooter = columnFooter != null && !onboardingMode;
  useEffect(() => {
    const scroll = scrollContainerRef.current;
    if (!hasColumnFooter || !scroll) {
      setHasContentBehindComposer(false);
      return;
    }
    const update = () => {
      const footerHeight = columnFooterRef.current?.offsetHeight ?? 0;
      const distance =
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
      setHasContentBehindComposer(distance > footerHeight + 8);
    };
    update();
    scroll.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    if (columnFooterRef.current) observer.observe(columnFooterRef.current);
    return () => {
      scroll.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [hasColumnFooter, scrollContainerRef]);
  const isLegacySkipConfirmation = pendingInputRequest?.options?.some(
    (option) => option.id === 'skip_confirmed' || option.id === 'answer_it',
  );
  const inputCard =
    pendingInputRequest && shouldShowInputRequestOverlay ? (
      onboardingMode ? (
        <div
          className="flex flex-col gap-3"
          data-testid="onboarding-answer"
          ref={inputCardRef}
        >
          <OnboardingChoiceCards
            hiddenOptionIds={ONBOARDING_HIDDEN_OPTION_IDS}
            isSubmitting={isSubmittingInputRequest}
            key={pendingInputRequest.inputRequestId}
            onSubmit={onSubmitInputRequest}
            request={pendingInputRequest}
          />
          {!isLegacySkipConfirmation ? (
            <OnboardingSkipCard
              isSubmitting={isSubmittingInputRequest}
              onSkip={() => onSubmitInputRequest('Skip', ['skip'])}
            />
          ) : null}
        </div>
      ) : (
        <div ref={inputCardRef}>
          <AgentInputRequestOverlay
            isSubmitting={isSubmittingInputRequest}
            key={pendingInputRequest.inputRequestId}
            onSubmit={onSubmitInputRequest}
            request={pendingInputRequest}
            variant="inline"
          />
        </div>
      )
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
      {isWideLayout ? (
        <AgentConversationTurnNavigator
          scrollContainerRef={scrollContainerRef}
          timeline={timeline}
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
          {!onboardingMode ? inputCard : null}

          {latestProposedPlan ? (
            <AgentPlanReviewSection
              plan={latestProposedPlan}
              isBusy={isBusy || isReadOnly || isPlanReviewPending}
              activeUiAction={activeUiAction}
              isCreatingFollowUpTasks={isCreatingFollowUpTasks}
              followUpTaskMessage={followUpTaskMessage}
              showFollowUpButton={showFollowUpButton && !isReadOnly}
              onApprove={onApprovePlan}
              onRequestChanges={onRequestPlanChanges}
              onCreateFollowUpTasks={onCreateFollowUpTasks}
            />
          ) : null}

          <AgentWorkObjects apiService={apiService} isReadOnly={isReadOnly} />

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
            onOpenInStudio={onOpenInStudio}
            onSelectCreditPack={onSelectCreditPack}
            onSelectIngredient={onIngredientSelect}
            onUiAction={onUiAction}
            hasDockedGenerationCard={hasDockedGenerationCard}
            // Docked composer status owns busy chrome — hide pure Thinking rows.
            suppressThinkingPlaceholder={padBottomForComposer}
          />
        </div>
        {hasColumnFooter ? (
          <div
            className={cn(
              'z-20',
              hasContentBehindComposer && 'sticky bottom-0 bg-background',
            )}
            data-composer-overlap={hasContentBehindComposer ? 'true' : 'false'}
            data-testid="agent-column-composer"
            ref={columnFooterRef}
          >
            {hasContentBehindComposer ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-gradient-to-t from-background to-transparent"
                data-composer-top-fade="true"
              />
            ) : null}
            {!isAtBottom ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex justify-center pb-2">
                <Button
                  ariaLabel="Scroll to latest message"
                  className="pointer-events-auto rounded-md border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
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
      </div>

      {onboardingMode && (inputCard || columnFooter) ? (
        <div
          className="relative z-20 shrink-0 bg-background"
          data-testid="agent-column-composer"
        >
          {!isAtBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex justify-center pb-2">
              <Button
                ariaLabel="Scroll to latest message"
                className="pointer-events-auto rounded-md border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
                icon={<ArrowDown className="size-4" />}
                onClick={scrollToBottom}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </div>
          ) : null}
          {inputCard ? (
            <div className={cn(AGENT_CONVERSATION_TRACK_CLASS, 'pb-2')}>
              {inputCard}
            </div>
          ) : null}
          {columnFooter}
        </div>
      ) : null}

      {!isAtBottom && !columnFooter && !onboardingMode ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
          style={{ bottom: composerTranscriptPaddingPx }}
        >
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            icon={<ArrowDown className="size-4" />}
            ariaLabel="Scroll to latest message"
            className="pointer-events-auto rounded-md border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
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
