import { useAgentSetupStatus } from '@genfeedai/agent/components/useAgentSetupStatus';
import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildThreadSummaryFromSnapshot,
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  mapSnapshotWorkEvents,
  readSnapshotRunError,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { conversationHydrationFlights } from '@genfeedai/agent/utils/conversation-hydration-flight';
import { extractThreadOutputs } from '@genfeedai/agent/utils/extract-thread-outputs';
import { filterActionsByRole } from '@genfeedai/agent/utils/filter-actions-by-role';
import {
  planThreadSwitchFetches,
  shouldDelayThreadSwitchFetch,
  THREAD_SWITCH_DEBOUNCE_MS,
} from '@genfeedai/agent/utils/plan-thread-switch-fetches';
import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';
import { AgentThreadStatus, type MemberRole } from '@genfeedai/contracts';
import {
  Briefcase,
  Calendar,
  ChartColumn,
  ClipboardCheck,
  Heart,
  Paintbrush,
  Rocket,
} from 'lucide-react';
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const DEFAULT_AGENT_ACTIONS: SuggestedAction[] = [
  {
    icon: createElement(Calendar, { className: 'size-5 text-foreground/50' }),
    label: 'Plan this week',
    prompt: 'Help me plan this week of content',
  },
  {
    icon: createElement(ClipboardCheck, {
      className: 'size-5 text-foreground/50',
    }),
    label: 'Review queue',
    prompt: 'Show me what needs review',
  },
  {
    icon: createElement(ChartColumn, {
      className: 'size-5 text-foreground/50',
    }),
    label: 'Check performance',
    prompt: 'Summarize my recent content performance',
  },
];

const ONBOARDING_SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    icon: createElement(Rocket, { className: 'size-5 text-foreground/50' }),
    label: "Let's go",
    prompt: "I'm ready to set up my account",
  },
  {
    icon: createElement(Heart, { className: 'size-5 text-foreground/50' }),
    label: 'Fitness creator',
    prompt: "I'm a fitness content creator",
  },
  {
    icon: createElement(Paintbrush, { className: 'size-5 text-foreground/50' }),
    label: 'Art and design',
    prompt: 'I create art and design content',
  },
  {
    icon: createElement(Briefcase, { className: 'size-5 text-foreground/50' }),
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
  const updateThread = useAgentChatStore((s) => s.updateThread);
  const upsertThread = useAgentChatStore((s) => s.upsertThread);
  const setError = useAgentChatStore((s) => s.setError);
  const setMessagesPage = useAgentChatStore((s) => s.setMessagesPage);
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
  const cacheConversation = useAgentChatStore((s) => s.cacheConversation);
  const restoreCachedConversation = useAgentChatStore(
    (s) => s.restoreCachedConversation,
  );
  const isConversationCacheFresh = useAgentChatStore(
    (s) => s.isConversationCacheFresh,
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
  const activeThreadBrandId = useAgentChatStore((s) =>
    threadId
      ? (s.threads.find((thread) => thread.id === threadId)?.brandId ?? null)
      : null,
  );
  // Store status can land before getThread resolves (or after archive-from-menu).
  // Prefer either source so isReadOnly does not lag open for regenerates.
  const storeThreadStatus = useAgentChatStore((s) =>
    threadId
      ? (s.threads.find((thread) => thread.id === threadId)?.status ?? null)
      : null,
  );
  const activeThreadRef = useRef(activeStoreThreadId);
  const lastSwitchAtRef = useRef<number | null>(null);
  const lastSwitchThreadIdRef = useRef<string | null>(null);
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
      return latestMessage.metadata.suggestedActions.slice(0, 3);
    }

    if (pageContext?.suggestedActions?.length) {
      return pageContext.suggestedActions.slice(0, 3);
    }
    return filterActionsByRole(DEFAULT_AGENT_ACTIONS, userRole).slice(0, 3);
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

    apiService
      .getCreditsInfo(controller.signal)
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

  // When the URL has no thread, clear conversation state in layout so the
  // empty state does not paint the previous thread's data. Must not run
  // during render: zustand updates notify AgentChatContainer and React
  // forbids updating another component while rendering this one.
  //
  // Sentinel: `null` = never cleared, `undefined` = already cleared for the
  // current no-thread surface, `string` = last tracked thread id. Mounting
  // directly on a no-thread route starts at `null` so the clear still runs.
  const clearedForThreadIdRef = useRef<string | undefined | null>(null);
  useLayoutEffect(() => {
    if (!authReady) {
      return;
    }

    if (!threadId) {
      if (clearedForThreadIdRef.current === undefined) {
        return;
      }
      clearedForThreadIdRef.current = undefined;
      // Leaving via the agent root is still leaving a thread — bank it so
      // stepping back into that conversation is instant.
      if (activeThreadRef.current) {
        cacheConversation(activeThreadRef.current);
      }
      setIsLoadingThread(false);
      setActiveThreadStatus(null);
      setWorkspacePlanningTaskId(null);
      setActiveThread(null);
      setDraftPlanModeEnabled(false);
      setLatestProposedPlan(null);
      resetActiveConversationState();
      return;
    }

    if (clearedForThreadIdRef.current !== threadId) {
      clearedForThreadIdRef.current = threadId;
    }
  }, [
    authReady,
    cacheConversation,
    threadId,
    resetActiveConversationState,
    setActiveThread,
    setDraftPlanModeEnabled,
    setLatestProposedPlan,
  ]);

  useEffect(() => {
    if (!authReady || !threadId) {
      return;
    }

    const controller = new AbortController();
    const previousThreadId = activeThreadRef.current;
    const shouldPreserveVisibleThread =
      previousThreadId === threadId && messageCountRef.current > 0;

    // Keep what the user was just reading so switching back is a re-paint
    // rather than another round trip.
    if (previousThreadId && !shouldPreserveVisibleThread) {
      cacheConversation(previousThreadId);
    }

    setActiveThread(threadId);
    clearThreadAttention(threadId);

    // These describe the thread being opened, not the one being left, and only
    // the thread response refreshes them. A cache hit makes the conversation
    // interactive before that response lands, so carrying the previous thread's
    // status over would let resolvedThreadStatus report ACTIVE for an archived
    // thread and leave the composer writable through the revalidation window.
    if (previousThreadId !== threadId) {
      setActiveThreadStatus(null);
      setWorkspacePlanningTaskId(null);
    }

    // Cache hit: show the thread immediately and revalidate underneath. Only a
    // genuinely unseen thread gets the blank track and the skeleton.
    const hasVisibleConversation =
      shouldPreserveVisibleThread || restoreCachedConversation(threadId);
    if (!hasVisibleConversation) {
      resetActiveConversationState();
    }
    setIsLoadingThread(!hasVisibleConversation);

    // First prompt on `/agent/new`: `sendMessage` creates the thread, the store
    // starts streaming it, then the URL catches up and this effect runs for
    // that same thread. The client already owns the live turn — a messages or
    // snapshot page fetched now predates the assistant reply and would reset
    // the stream (text, work events, pending generation card) and replace the
    // transcript with a stale page. Read at effect time: the stream slice must
    // never be a dependency of the switch effect.
    const liveState = useAgentChatStore.getState();
    const hasLiveLocalRun =
      shouldPreserveVisibleThread &&
      (liveState.stream.isStreaming || liveState.activeRunId !== null);

    let hasReportedLoadFailure = false;
    const reportLoadFailure = (error: unknown) => {
      if (controller.signal.aborted || hasReportedLoadFailure) {
        return;
      }
      hasReportedLoadFailure = true;
      setIsLoadingThread(false);
      setWorkspacePlanningTaskId(null);
      setError(
        isAuthError(error) ? AUTH_REQUIRED_MESSAGE : LOAD_THREAD_ERROR_MESSAGE,
      );
    };

    // #2790: a warm, still-fresh cache entry means the thread record and
    // snapshot the user is about to see are already the ones this switch
    // would fetch. Skip those two requests entirely — freshness is
    // time-bounded (`CONVERSATION_CACHE_FRESHNESS_MS`), so a thread that
    // changed server-side while the tab was open still converges shortly
    // after the user returns to it.
    const isThreadDataFresh = isConversationCacheFresh(threadId);

    // Everything else the thread response feeds has a second source (the
    // cached conversation, `storeThreadStatus`, `useAgentThreadList`'s prompt
    // write). These two do not: `workspacePlanningTaskId` is local state whose
    // only populating writer is the skipped handler below, and
    // `restoreCachedConversation` forces `draftPlanModeEnabled` to false. Left
    // unset, a warm open hides the follow-up-tasks affordance and shows the
    // composer's plan-mode toggle off. A thread can only be cache-fresh if it
    // was prefetched or opened from the list, so its row is in the store — and
    // the list serializes both `source` and `planModeEnabled`. Read at effect
    // time rather than through a selector so this never re-runs the switch.
    if (isThreadDataFresh) {
      const listedThread = useAgentChatStore
        .getState()
        .threads.find((thread) => thread.id === threadId);
      setWorkspacePlanningTaskId(
        parseWorkspacePlanningTaskId(listedThread?.source),
      );
      setDraftPlanModeEnabled(listedThread?.planModeEnabled ?? false);
    }

    const switchStartedAt = Date.now();
    const shouldDelay = shouldDelayThreadSwitchFetch({
      debounceMs: THREAD_SWITCH_DEBOUNCE_MS,
      lastSwitchAt: lastSwitchAtRef.current,
      lastThreadId: lastSwitchThreadIdRef.current,
      now: switchStartedAt,
      threadId,
    });
    lastSwitchAtRef.current = switchStartedAt;
    lastSwitchThreadIdRef.current = threadId;

    const startThreadRequests = () => {
      if (controller.signal.aborted) {
        return;
      }

      // A hover prefetch of this thread is just as stale as a fresh fetch would
      // be while the client owns the live run — ignore it too.
      const existingFlight = hasLiveLocalRun
        ? undefined
        : conversationHydrationFlights.get(threadId);
      const plan = planThreadSwitchFetches({
        hasInFlightHydration: Boolean(existingFlight),
        hasLiveLocalRun,
        isCacheFresh: isThreadDataFresh,
      });

      const hydrationFlight =
        existingFlight ??
        (plan.shouldFetchMessages
          ? conversationHydrationFlights.begin(threadId, async (signal) => {
              const [page, snapshot] = await Promise.all([
                apiService.getMessagesPage(
                  threadId,
                  { limit: AGENT_MESSAGE_PAGE_SIZE },
                  signal,
                ),
                plan.shouldFetchSnapshot
                  ? apiService.getThreadSnapshot(threadId, signal)
                  : Promise.resolve(null),
              ]);
              return { page, snapshot };
            })
          : null);

      const messagesRequest = hydrationFlight
        ? hydrationFlight.promise.then(({ page }) => {
            if (!controller.signal.aborted) {
              resetStreamState();
              setMessagesPage(page);
              setIsLoadingThread(false);
            }
            return page.messages;
          })
        : Promise.resolve([]);

      // The two Promise.all chains below only report a failure when the thread
      // or snapshot request they're chained to also rejects. When both are
      // skipped for a fresh cache, a messages-only failure would otherwise go
      // unreported — this catch covers that path. `reportLoadFailure` is
      // dedup-guarded, so it is harmless if a chain below also fires it.
      if (hydrationFlight) {
        messagesRequest.catch(reportLoadFailure);
      }

      const snapshotRequest =
        hydrationFlight && !isThreadDataFresh
          ? hydrationFlight.promise.then(({ snapshot }) => {
              if (!snapshot) {
                throw new Error(LOAD_THREAD_ERROR_MESSAGE);
              }
              return snapshot;
            })
          : null;

      // Chained on the messages paint, not raced with it: resetStreamState above
      // clears workEvents and run status, so it must never land after the
      // snapshot has filled them in.
      if (snapshotRequest) {
        Promise.all([messagesRequest, snapshotRequest])
          .then(([, snapshot]) => {
            if (controller.signal.aborted) {
              return;
            }
            setLatestProposedPlan(snapshot.latestProposedPlan ?? null);
            setPendingInputRequest(mapSnapshotPendingInputRequest(snapshot));
            setActiveRun(snapshot.activeRun?.runId ?? null, {
              startedAt: snapshot.activeRun?.startedAt ?? null,
              status: mapSnapshotRunStatus(snapshot.activeRun?.status),
            });
            setRunStartedAt(snapshot.activeRun?.startedAt ?? null);
            setWorkEvents(mapSnapshotWorkEvents(snapshot));
            setError(readSnapshotRunError(snapshot));
          })
          .catch(reportLoadFailure);
      }

      const threadRequest = plan.shouldFetchThread
        ? apiService.getThread(threadId, controller.signal)
        : null;

      if (threadRequest && snapshotRequest) {
        Promise.all([threadRequest, messagesRequest, snapshotRequest])
          .then(([thread, msgs, snapshot]) => {
            if (controller.signal.aborted) {
              return;
            }
            setActiveThreadStatus(thread.status);
            setWorkspacePlanningTaskId(
              parseWorkspacePlanningTaskId(thread.source),
            );
            setThreadPrompt(threadId, thread.systemPrompt ?? undefined);
            const now = new Date().toISOString();
            const firstUserMessage = msgs.find((msg) => msg.role === 'user');
            upsertThread({
              brandId: thread.brandId,
              createdAt: now,
              contextVersion: thread.contextVersion,
              id: threadId,
              organizationId: thread.organizationId,
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
          })
          .catch(reportLoadFailure);
      } else if (threadRequest) {
        threadRequest
          .then((thread) => {
            if (controller.signal.aborted) {
              return;
            }
            setActiveThreadStatus(thread.status);
            setWorkspacePlanningTaskId(
              parseWorkspacePlanningTaskId(thread.source),
            );
            setThreadPrompt(threadId, thread.systemPrompt ?? undefined);
            setDraftPlanModeEnabled(thread.planModeEnabled ?? false);
          })
          .catch(reportLoadFailure);
      }
    };

    const timeoutId = shouldDelay
      ? window.setTimeout(startThreadRequests, THREAD_SWITCH_DEBOUNCE_MS)
      : undefined;
    if (!shouldDelay) {
      startThreadRequests();
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      controller.abort();
      conversationHydrationFlights.abort(threadId);
    };
  }, [
    threadId,
    apiService,
    authReady,
    cacheConversation,
    clearThreadAttention,
    isConversationCacheFresh,
    restoreCachedConversation,
    setActiveThread,
    setActiveRun,
    setError,
    setMessagesPage,
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

  const handleUnarchiveActiveThread = useCallback(async () => {
    if (!threadId) {
      return;
    }

    const restored = await apiService.unarchiveThread(threadId);
    const nextStatus = restored.status ?? AgentThreadStatus.ACTIVE;
    setActiveThreadStatus(nextStatus);
    updateThread(threadId, {
      status: nextStatus,
      updatedAt: restored.updatedAt ?? new Date().toISOString(),
    });
  }, [apiService, threadId, updateThread]);

  const resolvedThreadStatus = activeThreadStatus ?? storeThreadStatus ?? null;

  return {
    activeThreadBrandId,
    activeThreadStatus: resolvedThreadStatus,
    agentSetup,
    currentStepId,
    handleUnarchiveActiveThread,
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
