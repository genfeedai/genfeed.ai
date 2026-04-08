import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentOnboardingChecklist } from '@genfeedai/agent/components/AgentOnboardingChecklist';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildThreadSummaryFromSnapshot,
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  mapSnapshotWorkEvents,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { extractThreadOutputs } from '@genfeedai/agent/utils/extract-thread-outputs';
import { filterActionsByRole } from '@genfeedai/agent/utils/filter-actions-by-role';
import type { MemberRole } from '@genfeedai/enums';
import { AgentThreadStatus, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBriefcase,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineHeart,
  HiOutlineMagnifyingGlass,
  HiOutlinePaintBrush,
  HiOutlinePhoto,
  HiOutlineRocketLaunch,
} from 'react-icons/hi2';

const DEFAULT_AGENT_ACTIONS: SuggestedAction[] = [
  {
    icon: HiOutlineCalendarDays({ className: 'h-5 w-5 text-foreground/50' }),
    label: 'Plan this week',
    prompt: 'Help me plan this week of content',
  },
  {
    icon: HiOutlineClipboardDocumentCheck({
      className: 'h-5 w-5 text-foreground/50',
    }),
    label: 'Review queue',
    prompt: 'Show me what needs review',
  },
  {
    icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
    label: 'Check performance',
    prompt: 'Summarize my recent content performance',
  },
  {
    icon: HiOutlineMagnifyingGlass({ className: 'h-5 w-5 text-foreground/50' }),
    label: 'Brainstorm ideas',
    prompt: 'Give me 10 content ideas I can create next',
  },
];

const ONBOARDING_SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    icon: <HiOutlineRocketLaunch className="h-5 w-5 text-foreground/50" />,
    label: "Let's go",
    prompt: "I'm ready to set up my account",
  },
  {
    icon: <HiOutlineHeart className="h-5 w-5 text-foreground/50" />,
    label: 'Fitness creator',
    prompt: "I'm a fitness content creator",
  },
  {
    icon: <HiOutlinePaintBrush className="h-5 w-5 text-foreground/50" />,
    label: 'Art and design',
    prompt: 'I create art and design content',
  },
  {
    icon: <HiOutlineBriefcase className="h-5 w-5 text-foreground/50" />,
    label: 'Business content',
    prompt: 'I create business and entrepreneurship content',
  },
];

const AUTH_REQUIRED_MESSAGE =
  'Authentication required. Refresh the page or sign in again.';
const LOAD_THREAD_ERROR_MESSAGE =
  'Failed to load this thread. Refresh and try again.';
const WORKSPACE_PLANNING_THREAD_SOURCE_PREFIX = 'workspace-planning:';

function parseWorkspacePlanningTaskId(source?: string): string | null {
  if (!source?.startsWith(WORKSPACE_PLANNING_THREAD_SOURCE_PREFIX)) {
    return null;
  }

  const taskId = source.slice(WORKSPACE_PLANNING_THREAD_SOURCE_PREFIX.length);

  return taskId.length > 0 ? taskId : null;
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('401') || error.message.includes('Unauthorized')
  );
}

interface AgentFullPageProps {
  apiService: AgentApiService;
  authReady?: boolean;
  threadId?: string;
  showThreadSidebar?: boolean;
  onboardingMode?: boolean;
  onOnboardingCompleted?: () => void | Promise<void>;
  onCreateFollowUpTasks?: (taskId: string) => Promise<{ createdCount: number }>;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onNavigateToBilling?: () => void;
  userRole?: MemberRole;
}

export function AgentFullPage({
  apiService,
  authReady = true,
  threadId,
  showThreadSidebar = true,
  onboardingMode = false,
  onOnboardingCompleted,
  onCreateFollowUpTasks,
  onOAuthConnect,
  onSelectCreditPack,
  userRole,
}: AgentFullPageProps): ReactElement {
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [mobileChecklistOpen, setMobileChecklistOpen] = useState(false);
  const [mobileOutputsOpen, setMobileOutputsOpen] = useState(false);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  const [activeThreadStatus, setActiveThreadStatus] =
    useState<AgentThreadStatus | null>(null);
  const [workspacePlanningTaskId, setWorkspacePlanningTaskId] = useState<
    string | null
  >(null);
  const showOnboardingChecklistChrome = false;

  const onboardingSteps = useAgentChatStore((s) => s.onboardingSteps);
  const onboardingEarnedCredits = useAgentChatStore(
    (s) => s.onboardingEarnedCredits,
  );
  const onboardingSignupGiftCredits = useAgentChatStore(
    (s) => s.onboardingSignupGiftCredits,
  );
  const onboardingTotalJourneyCredits = useAgentChatStore(
    (s) => s.onboardingTotalJourneyCredits,
  );
  const onboardingTotalVisibleCredits = useAgentChatStore(
    (s) => s.onboardingTotalVisibleCredits,
  );
  const onboardingCompletionPercent = useAgentChatStore(
    (s) => s.onboardingCompletionPercent,
  );
  const currentStepId = onboardingSteps.find(
    (s) => s.status === 'in-progress',
  )?.id;
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const upsertThread = useAgentChatStore((s) => s.upsertThread);
  const setError = useAgentChatStore((s) => s.setError);
  const setMessages = useAgentChatStore((s) => s.setMessages);
  const existingMessages = useAgentChatStore((s) => s.messages);
  const setActiveRun = useAgentChatStore((s) => s.setActiveRun);
  const setPendingInputRequest = useAgentChatStore(
    (s) => s.setPendingInputRequest,
  );
  const setRunStartedAt = useAgentChatStore((s) => s.setRunStartedAt);
  const setWorkEvents = useAgentChatStore((s) => s.setWorkEvents);
  const resetStreamState = useAgentChatStore((s) => s.resetStreamState);
  const resetActiveConversationState = useAgentChatStore(
    (s) => s.resetActiveConversationState,
  );
  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const setModelCosts = useAgentChatStore((s) => s.setModelCosts);
  const setOnboardingChecklist = useAgentChatStore(
    (s) => s.setOnboardingChecklist,
  );
  const setDraftPlanModeEnabled = useAgentChatStore(
    (s) => s.setDraftPlanModeEnabled,
  );
  const setLatestProposedPlan = useAgentChatStore(
    (s) => s.setLatestProposedPlan,
  );
  const setThreadPrompt = useAgentChatStore((s) => s.setThreadPrompt);
  const clearThreadAttention = useAgentChatStore((s) => s.clearThreadAttention);
  const pageContext = useAgentChatStore((s) => s.pageContext);
  const activeStoreThreadId = useAgentChatStore((s) => s.activeThreadId);
  const activeThreadRef = useRef(activeStoreThreadId);
  const messageCountRef = useRef(existingMessages.length);
  const threadOutputs = useMemo(
    () => extractThreadOutputs(existingMessages),
    [existingMessages],
  );
  const hasThreadOutputs = threadOutputs.length > 0;

  useEffect(() => {
    activeThreadRef.current = activeStoreThreadId;
  }, [activeStoreThreadId]);

  useEffect(() => {
    messageCountRef.current = existingMessages.length;
  }, [existingMessages.length]);

  const resolvedActions = useMemo(() => {
    const latestMessage = existingMessages.at(-1);
    if (
      latestMessage?.role === 'assistant' &&
      latestMessage.metadata?.suggestedActions?.length
    ) {
      return latestMessage.metadata.suggestedActions;
    }

    if (pageContext?.suggestedActions?.length) {
      return pageContext.suggestedActions;
    }
    return filterActionsByRole(DEFAULT_AGENT_ACTIONS, userRole);
  }, [existingMessages, pageContext, userRole]);
  const showRuntimeSuggestedActions = useMemo(() => {
    const latestMessage = existingMessages.at(-1);

    return Boolean(
      latestMessage?.role === 'assistant' &&
        latestMessage.metadata?.suggestedActions?.length,
    );
  }, [existingMessages]);

  useEffect(() => {
    if (hasThreadOutputs) {
      return;
    }

    setMobileOutputsOpen(false);
  }, [hasThreadOutputs]);

  useEffect(() => {
    if (!onboardingMode) {
      return;
    }

    const latestChecklistAction = [...existingMessages]
      .reverse()
      .flatMap((message) => message.metadata?.uiActions ?? [])
      .find(
        (action): action is AgentUiAction =>
          action.type === 'onboarding_checklist_card',
      );

    if (!latestChecklistAction?.checklist?.length) {
      return;
    }

    const recommendedId = latestChecklistAction.checklist.find(
      (item) => item.isRecommended,
    )?.id;

    setOnboardingChecklist({
      completionPercent: latestChecklistAction.completionPercent,
      earnedCredits: latestChecklistAction.earnedCredits,
      signupGiftCredits: latestChecklistAction.signupGiftCredits,
      steps: latestChecklistAction.checklist.map((item) => ({
        ctaHref: item.ctaHref,
        ctaLabel: item.ctaLabel,
        description: item.description ?? '',
        id: item.id,
        isClaimed: item.isClaimed,
        isRecommended: item.isRecommended,
        rewardCredits: item.rewardCredits,
        status: item.isCompleted
          ? 'complete'
          : item.id === recommendedId
            ? 'in-progress'
            : 'pending',
        title: item.label,
      })),
      totalJourneyCredits: latestChecklistAction.totalJourneyCredits,
      totalOnboardingCreditsVisible:
        latestChecklistAction.totalOnboardingCreditsVisible,
    });
  }, [existingMessages, onboardingMode, setOnboardingChecklist]);

  // Fetch credits info on mount
  useEffect(() => {
    if (!authReady) {
      return;
    }

    const controller = new AbortController();

    runAgentApiEffect(apiService.getCreditsInfoEffect(controller.signal))
      .then((info) => {
        if (!info) {
          return;
        }

        setCreditsRemaining(info.balance);
        setModelCosts(info.modelCosts);
      })
      .catch(() => {
        // Silently fail — credits display will just show null
      });

    return () => controller.abort();
  }, [apiService, authReady, setCreditsRemaining, setModelCosts]);

  // Load thread from URL param
  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (!threadId) {
      setIsLoadingThread(false);
      setActiveThreadStatus(null);
      setWorkspacePlanningTaskId(null);
      setActiveThread(null);
      setDraftPlanModeEnabled(false);
      setLatestProposedPlan(null);
      resetActiveConversationState();
      return;
    }
  }, [
    authReady,
    threadId,
    setActiveThread,
    setDraftPlanModeEnabled,
    setLatestProposedPlan,
    resetActiveConversationState,
  ]);

  useEffect(() => {
    if (!authReady || !threadId) {
      return;
    }

    const controller = new AbortController();
    const shouldPreserveVisibleThread =
      activeThreadRef.current === threadId && messageCountRef.current > 0;

    setIsLoadingThread(true);
    setActiveThread(threadId);
    clearThreadAttention(threadId);
    if (!shouldPreserveVisibleThread) {
      resetActiveConversationState();
    }
    Promise.all([
      runAgentApiEffect(
        apiService.getThreadEffect(threadId, controller.signal),
      ),
      runAgentApiEffect(
        apiService.getMessagesEffect(
          threadId,
          { limit: 100 },
          controller.signal,
        ),
      ),
      runAgentApiEffect(
        apiService.getThreadSnapshotEffect(threadId, controller.signal),
      ),
    ])
      .then(([thread, msgs, snapshot]) => {
        if (!controller.signal.aborted) {
          resetStreamState();
          setMessages(msgs);
          setLatestProposedPlan(snapshot.latestProposedPlan ?? null);
          setPendingInputRequest(mapSnapshotPendingInputRequest(snapshot));
          setActiveRun(snapshot.activeRun?.runId ?? null, {
            startedAt: snapshot.activeRun?.startedAt ?? null,
            status: mapSnapshotRunStatus(snapshot.activeRun?.status),
          });
          setRunStartedAt(snapshot.activeRun?.startedAt ?? null);
          setWorkEvents(mapSnapshotWorkEvents(snapshot));
          setIsLoadingThread(false);
          setActiveThreadStatus(thread.status);
          setWorkspacePlanningTaskId(
            parseWorkspacePlanningTaskId(thread.source),
          );
          setThreadPrompt(threadId, thread.systemPrompt ?? undefined);
          const now = new Date().toISOString();
          const firstUserMessage = msgs.find((msg) => msg.role === 'user');
          upsertThread({
            createdAt: now,
            id: threadId,
            planModeEnabled: thread.planModeEnabled,
            source: thread.source,
            status: thread.status,
            title:
              thread.title ??
              firstUserMessage?.content?.slice(0, 60) ??
              msgs[0]?.content?.slice(0, 60) ??
              'Current chat',
            updatedAt: now,
            ...buildThreadSummaryFromSnapshot(snapshot, {
              isVisible: true,
              now,
            }),
          });
          setDraftPlanModeEnabled(thread.planModeEnabled ?? false);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setIsLoadingThread(false);
        if (isAuthError(error)) {
          setWorkspacePlanningTaskId(null);
          setError(AUTH_REQUIRED_MESSAGE);
          return;
        }
        setWorkspacePlanningTaskId(null);
        setError(LOAD_THREAD_ERROR_MESSAGE);
      });

    return () => controller.abort();
  }, [
    threadId,
    apiService,
    authReady,
    clearThreadAttention,
    setActiveThread,
    setActiveRun,
    setError,
    setMessages,
    setLatestProposedPlan,
    setDraftPlanModeEnabled,
    setPendingInputRequest,
    setRunStartedAt,
    setThreadPrompt,
    setWorkEvents,
    upsertThread,
    resetStreamState,
    resetActiveConversationState,
  ]);

  return (
    <div
      className={cn('flex min-h-0 flex-1', onboardingMode && 'max-md:pb-14')}
    >
      {showThreadSidebar ? (
        <div className="hidden xl:flex xl:w-[15rem] xl:shrink-0 xl:border-r xl:border-white/[0.08] xl:bg-black/10">
          <AgentSidebarContent apiService={apiService} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3 xl:hidden">
          {showThreadSidebar ? (
            <Button
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
              onClick={() => setMobileThreadsOpen(true)}
              className="inline-flex items-center gap-2 border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-white/[0.06] hover:text-foreground"
            >
              <HiOutlineChatBubbleLeftRight className="h-4 w-4" />
              Threads
            </Button>
          ) : null}
          {hasThreadOutputs ? (
            <Button
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
              onClick={() => setMobileOutputsOpen(true)}
              className="inline-flex items-center gap-2 border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-white/[0.06] hover:text-foreground"
            >
              <HiOutlinePhoto className="h-4 w-4" />
              Outputs
            </Button>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AgentChatContainer
              archivedNotice={
                activeThreadStatus === AgentThreadStatus.ARCHIVED
                  ? 'This thread is archived. It is visible for reference but cannot be edited.'
                  : null
              }
              apiService={apiService}
              isLoadingThread={isLoadingThread}
              isStreaming
              isReadOnly={activeThreadStatus === AgentThreadStatus.ARCHIVED}
              emptyStateTitle={
                onboardingMode ? 'Welcome to GenFeed' : 'Start a chat'
              }
              emptyStateDescription={
                onboardingMode
                  ? "I'm your AI content agent. Let's get you set up in a few minutes."
                  : 'Ask for help planning content, reviewing drafts, or understanding what to do next.'
              }
              placeholder="Ask for help with content, review, or planning..."
              suggestedActions={
                onboardingMode ? ONBOARDING_SUGGESTED_ACTIONS : resolvedActions
              }
              showSuggestedActionsWhenNotEmpty={showRuntimeSuggestedActions}
              onCreateFollowUpTasks={onCreateFollowUpTasks}
              onOnboardingCompleted={onOnboardingCompleted}
              onOAuthConnect={onOAuthConnect}
              onSelectCreditPack={onSelectCreditPack}
              onboardingMode={onboardingMode}
              isWideLayout={!hasThreadOutputs}
              promptBarLayoutMode="surface-fixed"
              workspacePlanningTaskId={workspacePlanningTaskId}
            />
          </div>

          {hasThreadOutputs ? (
            <div className="hidden xl:flex xl:w-[24rem] xl:shrink-0 xl:border-l xl:border-white/[0.08] xl:bg-black/10">
              <AgentOutputsPanel className="h-full w-full" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Onboarding checklist sidebar — desktop */}
      {showOnboardingChecklistChrome && onboardingMode && (
        <div className="w-80 shrink-0 border-l border-white/[0.06] max-md:hidden">
          <AgentOnboardingChecklist
            completionPercent={onboardingCompletionPercent}
            currentStepId={currentStepId}
            earnedCredits={onboardingEarnedCredits}
            signupGiftCredits={onboardingSignupGiftCredits}
            steps={onboardingSteps}
            totalOnboardingCreditsVisible={onboardingTotalVisibleCredits}
            totalJourneyCredits={onboardingTotalJourneyCredits}
          />
        </div>
      )}

      {/* Onboarding checklist — mobile bottom bar + drawer */}
      {showOnboardingChecklistChrome && onboardingMode && (
        <>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-white/[0.06] bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden"
            onClick={() => setMobileChecklistOpen(true)}
          >
            <div className="flex items-center gap-2">
              <HiOutlineCheckCircle className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Activation Journey
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {onboardingEarnedCredits}/{onboardingTotalJourneyCredits} credits
            </span>
          </Button>

          <Drawer
            open={mobileChecklistOpen}
            onOpenChange={setMobileChecklistOpen}
          >
            <DrawerContent className="max-h-[70vh]">
              <DrawerHeader>
                <DrawerTitle>Activation Journey</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto px-1 pb-6">
                <AgentOnboardingChecklist
                  completionPercent={onboardingCompletionPercent}
                  currentStepId={currentStepId}
                  earnedCredits={onboardingEarnedCredits}
                  signupGiftCredits={onboardingSignupGiftCredits}
                  steps={onboardingSteps}
                  totalOnboardingCreditsVisible={onboardingTotalVisibleCredits}
                  totalJourneyCredits={onboardingTotalJourneyCredits}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {showThreadSidebar ? (
        <Drawer open={mobileThreadsOpen} onOpenChange={setMobileThreadsOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Threads</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto pb-6">
              <AgentSidebarContent apiService={apiService} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}

      {hasThreadOutputs ? (
        <Drawer open={mobileOutputsOpen} onOpenChange={setMobileOutputsOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle>Outputs</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto pb-6">
              <AgentOutputsPanel className="h-full" />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}
