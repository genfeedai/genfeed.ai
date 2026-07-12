import { useAgentSetupStatus } from '@genfeedai/agent/components/useAgentSetupStatus';
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
import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';
import type { AgentThreadStatus, MemberRole } from '@genfeedai/enums';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBriefcase,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentCheck,
  HiOutlineHeart,
  HiOutlineMagnifyingGlass,
  HiOutlinePaintBrush,
  HiOutlineRocketLaunch,
} from 'react-icons/hi2';

const DEFAULT_AGENT_ACTIONS: SuggestedAction[] = [
  {
    icon: HiOutlineCalendarDays({ className: 'size-5 text-foreground/50' }),
    label: 'Plan this week',
    prompt: 'Help me plan this week of content',
  },
  {
    icon: HiOutlineClipboardDocumentCheck({
      className: 'size-5 text-foreground/50',
    }),
    label: 'Review queue',
    prompt: 'Show me what needs review',
  },
  {
    icon: HiOutlineChartBar({ className: 'size-5 text-foreground/50' }),
    label: 'Check performance',
    prompt: 'Summarize my recent content performance',
  },
  {
    icon: HiOutlineMagnifyingGlass({ className: 'size-5 text-foreground/50' }),
    label: 'Brainstorm ideas',
    prompt: 'Give me 10 content ideas I can create next',
  },
];

const ONBOARDING_SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    icon: HiOutlineRocketLaunch({ className: 'size-5 text-foreground/50' }),
    label: "Let's go",
    prompt: "I'm ready to set up my account",
  },
  {
    icon: HiOutlineHeart({ className: 'size-5 text-foreground/50' }),
    label: 'Fitness creator',
    prompt: "I'm a fitness content creator",
  },
  {
    icon: HiOutlinePaintBrush({ className: 'size-5 text-foreground/50' }),
    label: 'Art and design',
    prompt: 'I create art and design content',
  },
  {
    icon: HiOutlineBriefcase({ className: 'size-5 text-foreground/50' }),
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

interface UseAgentFullPageParams {
  apiService: AgentApiService;
  authReady: boolean;
  threadId?: string;
  onboardingMode: boolean;
  userRole?: MemberRole;
}

export function useAgentFullPage({
  apiService,
  authReady,
  threadId: rawThreadId,
  onboardingMode,
  userRole,
}: UseAgentFullPageParams) {
  // Treat malformed ids (including the stringified "undefined" that a bad
  // /agent/undefined URL produces) as "no thread" so the snapshot/thread/
  // message fetches never fire against /threads/undefined/*.
  const threadId = isRenderableThreadId(rawThreadId) ? rawThreadId : undefined;
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [mobileChecklistOpen, setMobileChecklistOpen] = useState(false);
  const [mobileOutputsOpen, setMobileOutputsOpen] = useState(false);
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  const [activeThreadStatus, setActiveThreadStatus] =
    useState<AgentThreadStatus | null>(null);
  const [workspacePlanningTaskId, setWorkspacePlanningTaskId] = useState<
    string | null
  >(null);

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

  const agentSetup = useAgentSetupStatus();
  // Thread outputs take priority over the setup panel: only offer setup in the
  // right pane / mobile drawer when the active thread has produced nothing yet.
  const showSetupPanel = agentSetup.showSetupPanel && !hasThreadOutputs;

  useEffect(() => {
    activeThreadRef.current = activeStoreThreadId;
  }, [activeStoreThreadId]);

  useEffect(() => {
    if (showSetupPanel) {
      return;
    }

    setMobileSetupOpen(false);
  }, [showSetupPanel]);

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

  return {
    activeThreadStatus,
    agentSetup,
    currentStepId,
    hasThreadOutputs,
    isLoadingThread,
    mobileChecklistOpen,
    mobileOutputsOpen,
    mobileSetupOpen,
    mobileThreadsOpen,
    onboardingCompletionPercent,
    onboardingEarnedCredits,
    onboardingSignupGiftCredits,
    onboardingSteps,
    onboardingTotalJourneyCredits,
    onboardingTotalVisibleCredits,
    resolvedActions,
    setMobileChecklistOpen,
    setMobileOutputsOpen,
    setMobileSetupOpen,
    setMobileThreadsOpen,
    showRuntimeSuggestedActions,
    showSetupPanel,
    workspacePlanningTaskId,
    ONBOARDING_SUGGESTED_ACTIONS,
  };
}
