import type {
  AgentChatMessage,
  AgentInputRequest,
  AgentMemoryEntry,
  AgentProposedPlan,
  AgentThread,
  AgentToolCall,
  AgentUiAction,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
// Inlined from @genfeedai/types to avoid turbopack resolution issues
const ONBOARDING_SIGNUP_GIFT_CREDITS = 100;
const ONBOARDING_TOTAL_VISIBLE_CREDITS = 600;

import type {
  OnboardingChecklistStatus,
  OnboardingChecklistStep,
} from '@props/ui/agent/agent-onboarding.props';
import { AGENT_PANEL_OPEN_KEY } from '@services/core/agent-overlay-coordination.service';
import { create } from 'zustand';

export { AGENT_PANEL_OPEN_KEY };

function persistPanelPreference(isOpen: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(AGENT_PANEL_OPEN_KEY, String(isOpen));
}

interface AgentPageContext {
  route: string;
  suggestedActions: SuggestedAction[];
  placeholder?: string;
}

export type AgentSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

const DEFAULT_ONBOARDING_STEPS: OnboardingChecklistStep[] = [
  {
    ctaHref: '/chat/onboarding',
    ctaLabel: 'Continue in chat',
    description:
      'Tell the agent what you create so it can build your brand profile and generate a relevant first image.',
    id: 'complete_company_info',
    isClaimed: false,
    isRecommended: true,
    rewardCredits: 25,
    status: 'pending',
    title: 'Complete company info',
  },
  {
    ctaHref: '/chat/onboarding',
    ctaLabel: 'Generate in chat',
    description:
      'Generate your first image right away from the context you just shared.',
    id: 'generate_first_image',
    isClaimed: false,
    isRecommended: false,
    rewardCredits: 15,
    status: 'pending',
    title: 'Generate your first image',
  },
  {
    ctaHref: '/chat/onboarding',
    ctaLabel: 'Connect in chat',
    description:
      'Connect your first social account so GenFeed can tailor content to real channels.',
    id: 'connect_social_account',
    isClaimed: false,
    isRecommended: false,
    rewardCredits: 10,
    status: 'pending',
    title: 'Connect a social account',
  },
  {
    ctaHref: '/chat/onboarding',
    ctaLabel: 'Generate in chat',
    description: 'Generate your first video to unlock richer content creation.',
    id: 'generate_first_video',
    isClaimed: false,
    isRecommended: false,
    rewardCredits: 20,
    status: 'pending',
    title: 'Generate your first video',
  },
  {
    ctaHref: '/chat/onboarding',
    ctaLabel: 'Publish in chat',
    description:
      'Publish your first post to complete the journey and claim the final reward.',
    id: 'publish_first_post',
    isClaimed: false,
    isRecommended: false,
    rewardCredits: 30,
    status: 'pending',
    title: 'Publish your first post',
  },
];

interface AgentStreamState {
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  activeToolCalls: AgentToolCall[];
  pendingUiActions: AgentUiAction[];
}

interface AgentComposerSeed {
  content: string;
  nonce: number;
  threadId: string | null;
}

interface AgentChatState {
  activeRunId: string | null;
  draftPlanModeEnabled: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  messages: AgentChatMessage[];
  memoryEntries: AgentMemoryEntry[];
  threads: AgentThread[];
  activeThreadId: string | null;
  activeRunStatus:
    | 'idle'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled';
  isGenerating: boolean;
  isOpen: boolean;
  error: string | null;
  creditsRemaining: number | null;
  modelCosts: Record<string, number>;
  threadPrompts: Record<string, string | undefined>;
  pendingInputRequest: AgentInputRequest | null;
  pageContext: AgentPageContext | null;
  overlayActiveIds: string[];
  overlayAutoCollapsedAgent: boolean;
  userChangedAgentDuringOverlay: boolean;
  wasAgentOpenBeforeOverlay: boolean;
  onboardingSteps: OnboardingChecklistStep[];
  onboardingEarnedCredits: number;
  onboardingTotalJourneyCredits: number;
  onboardingSignupGiftCredits: number;
  onboardingTotalVisibleCredits: number;
  onboardingCompletionPercent: number;
  runStartedAt: string | null;
  workEvents: AgentWorkEvent[];
  socketConnectionState: AgentSocketConnectionState;
  stream: AgentStreamState;
  composerSeed: AgentComposerSeed | null;
  threadUiBusyById: Record<string, boolean>;
}

interface AgentChatActions {
  addPendingUiActions: (actions: AgentUiAction[]) => void;
  addWorkEvent: (event: AgentWorkEvent) => void;
  addMessage: (message: AgentChatMessage) => void;
  clearPendingInputRequest: () => void;
  setMessages: (messages: AgentChatMessage[]) => void;
  setThreads: (threads: AgentThread[]) => void;
  setActiveRun: (
    runId: string | null,
    options?: {
      startedAt?: string | null;
      status?: AgentChatState['activeRunStatus'];
    },
  ) => void;
  setActiveRunStatus: (status: AgentChatState['activeRunStatus']) => void;
  setPendingInputRequest: (request: AgentInputRequest | null) => void;
  setRunStartedAt: (startedAt: string | null) => void;
  setWorkEvents: (events: AgentWorkEvent[]) => void;
  upsertThread: (thread: AgentThread) => void;
  setActiveThread: (id: string | null) => void;
  setIsGenerating: (generating: boolean) => void;
  setIsOpen: (open: boolean) => void;
  setError: (error: string | null) => void;
  setCreditsRemaining: (credits: number) => void;
  setModelCosts: (costs: Record<string, number>) => void;
  setThreadPrompt: (threadId: string, prompt: string | undefined) => void;
  beginOverlaySession: (overlayId: string) => void;
  endOverlaySession: (overlayId: string) => void;
  clearMessages: () => void;
  resetActiveConversationState: () => void;
  toggleOpen: () => void;
  setPageContext: (context: AgentPageContext | null) => void;
  setMemoryEntries: (entries: AgentMemoryEntry[]) => void;
  addMemoryEntry: (entry: AgentMemoryEntry) => void;
  removeMemoryEntry: (entryId: string) => void;
  setOnboardingStepStatus: (
    stepId: string,
    status: OnboardingChecklistStatus,
  ) => void;
  setOnboardingChecklist: (payload: {
    steps: OnboardingChecklistStep[];
    earnedCredits?: number;
    totalJourneyCredits?: number;
    signupGiftCredits?: number;
    totalOnboardingCreditsVisible?: number;
    completionPercent?: number;
  }) => void;
  appendStreamToken: (token: string) => void;
  setStreamingReasoning: (content: string) => void;
  addActiveToolCall: (toolCall: AgentToolCall) => void;
  updateActiveToolCall: (
    toolCallId: string,
    update: Partial<AgentToolCall>,
  ) => void;
  finalizeStream: (message: AgentChatMessage) => void;
  resetStreamState: () => void;
  setSocketConnectionState: (state: AgentSocketConnectionState) => void;
  updateThread: (threadId: string, update: Partial<AgentThread>) => void;
  clearThreadAttention: (threadId: string) => void;
  seedComposer: (content: string, threadId?: string | null) => void;
  clearComposerSeed: () => void;
  setDraftPlanModeEnabled: (enabled: boolean) => void;
  setLatestProposedPlan: (plan: AgentProposedPlan | null) => void;
  setThreadUiBusy: (threadId: string, busy: boolean) => void;
}

export type AgentChatStore = AgentChatState & AgentChatActions;

const DEFAULT_STREAM_STATE: AgentStreamState = {
  activeToolCalls: [],
  isStreaming: false,
  pendingUiActions: [],
  streamingContent: '',
  streamingReasoning: '',
};

function deriveLatestProposedPlanFromMessages(
  messages: AgentChatMessage[],
): AgentProposedPlan | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]?.metadata?.proposedPlan;
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export const useAgentChatStore = create<AgentChatStore>((set, get) => ({
  activeRunId: null,
  activeRunStatus: 'idle',
  activeThreadId: null,
  addActiveToolCall: (toolCall) =>
    set((state) => ({
      stream: {
        ...state.stream,
        activeToolCalls: [...state.stream.activeToolCalls, toolCall],
      },
    })),
  addMemoryEntry: (entry) =>
    set((state) => ({ memoryEntries: [entry, ...state.memoryEntries] })),
  addMessage: (message) =>
    set((state) => ({
      latestProposedPlan:
        message.metadata?.proposedPlan ?? state.latestProposedPlan,
      messages: [...state.messages, message],
    })),
  addPendingUiActions: (actions) =>
    set((state) => ({
      stream: {
        ...state.stream,
        pendingUiActions: [...state.stream.pendingUiActions, ...actions],
      },
    })),
  addWorkEvent: (event) =>
    set((state) => {
      const existingIndex = state.workEvents.findIndex(
        (item) => item.id === event.id,
      );

      if (existingIndex === -1) {
        return { workEvents: [...state.workEvents, event] };
      }

      const next = [...state.workEvents];
      next[existingIndex] = event;
      return { workEvents: next };
    }),
  appendStreamToken: (token) =>
    set((state) => ({
      stream: {
        ...state.stream,
        streamingContent: state.stream.streamingContent + token,
      },
    })),
  beginOverlaySession: (overlayId) =>
    set((state) => {
      if (state.overlayActiveIds.includes(overlayId)) {
        return state;
      }

      const nextOverlayActiveIds = [...state.overlayActiveIds, overlayId];

      if (state.overlayActiveIds.length > 0) {
        return { overlayActiveIds: nextOverlayActiveIds };
      }

      if (!state.isOpen) {
        return {
          overlayActiveIds: nextOverlayActiveIds,
          overlayAutoCollapsedAgent: false,
          userChangedAgentDuringOverlay: false,
          wasAgentOpenBeforeOverlay: false,
        };
      }

      persistPanelPreference(false);

      return {
        isOpen: false,
        overlayActiveIds: nextOverlayActiveIds,
        overlayAutoCollapsedAgent: true,
        userChangedAgentDuringOverlay: false,
        wasAgentOpenBeforeOverlay: true,
      };
    }),
  clearComposerSeed: () => set({ composerSeed: null }),
  clearMessages: () =>
    set({
      activeRunId: null,
      activeRunStatus: 'idle',
      composerSeed: null,
      draftPlanModeEnabled: false,
      latestProposedPlan: null,
      messages: [],
      pendingInputRequest: null,
      runStartedAt: null,
      threadUiBusyById: {},
      workEvents: [],
    }),
  clearPendingInputRequest: () => set({ pendingInputRequest: null }),
  clearThreadAttention: (threadId) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, attentionState: null } : thread,
      ),
    })),
  composerSeed: null,
  creditsRemaining: null,
  draftPlanModeEnabled: false,
  endOverlaySession: (overlayId) =>
    set((state) => {
      if (!state.overlayActiveIds.includes(overlayId)) {
        return state;
      }

      const nextOverlayActiveIds = state.overlayActiveIds.filter(
        (activeOverlayId) => activeOverlayId !== overlayId,
      );

      if (nextOverlayActiveIds.length > 0) {
        return { overlayActiveIds: nextOverlayActiveIds };
      }

      const shouldRestoreAgent =
        state.overlayAutoCollapsedAgent &&
        state.wasAgentOpenBeforeOverlay &&
        !state.userChangedAgentDuringOverlay &&
        !state.isOpen;

      if (shouldRestoreAgent) {
        persistPanelPreference(true);
      }

      return {
        isOpen: shouldRestoreAgent ? true : state.isOpen,
        overlayActiveIds: [],
        overlayAutoCollapsedAgent: false,
        userChangedAgentDuringOverlay: false,
        wasAgentOpenBeforeOverlay: false,
      };
    }),
  error: null,
  finalizeStream: (message) =>
    set((state) => {
      const mergedUiActions = [
        ...(message.metadata?.uiActions ?? []),
        ...state.stream.pendingUiActions,
      ].filter((action, index, actions) => {
        return (
          actions.findIndex((candidate) => candidate.id === action.id) === index
        );
      });

      return {
        activeRunStatus: 'completed',
        latestProposedPlan:
          message.metadata?.proposedPlan ?? state.latestProposedPlan,
        messages: [
          ...state.messages,
          {
            ...message,
            metadata:
              mergedUiActions.length > 0
                ? {
                    ...(message.metadata ?? {}),
                    uiActions: mergedUiActions,
                  }
                : message.metadata,
          },
        ],
        pendingInputRequest: null,
        stream: { ...DEFAULT_STREAM_STATE },
      };
    }),
  isGenerating: false,
  isOpen: true, // SSR-safe default; localStorage sync in useEffect
  latestProposedPlan: null,
  memoryEntries: [],
  messages: [],
  modelCosts: {},
  onboardingCompletionPercent: 0,
  onboardingEarnedCredits: 0,
  onboardingSignupGiftCredits: ONBOARDING_SIGNUP_GIFT_CREDITS,
  onboardingSteps: DEFAULT_ONBOARDING_STEPS,
  onboardingTotalJourneyCredits: 100,
  onboardingTotalVisibleCredits: ONBOARDING_TOTAL_VISIBLE_CREDITS,
  overlayActiveIds: [],
  overlayAutoCollapsedAgent: false,
  pageContext: null,
  pendingInputRequest: null,
  removeMemoryEntry: (entryId) =>
    set((state) => ({
      memoryEntries: state.memoryEntries.filter((item) => item.id !== entryId),
    })),
  resetActiveConversationState: () =>
    set({
      activeRunId: null,
      activeRunStatus: 'idle',
      composerSeed: null,
      draftPlanModeEnabled: false,
      latestProposedPlan: null,
      messages: [],
      pendingInputRequest: null,
      runStartedAt: null,
      stream: { ...DEFAULT_STREAM_STATE },
      threadUiBusyById: {},
      workEvents: [],
    }),
  resetStreamState: () =>
    set((state) => ({
      activeRunStatus:
        state.activeRunStatus === 'cancelling' ? 'cancelling' : 'idle',
      stream: { ...DEFAULT_STREAM_STATE },
    })),
  runStartedAt: null,
  seedComposer: (content, threadId = null) =>
    set({
      composerSeed: {
        content,
        nonce: Date.now(),
        threadId,
      },
    }),
  setActiveRun: (runId, options) =>
    set({
      activeRunId: runId,
      activeRunStatus: options?.status ?? (runId ? 'running' : 'idle'),
      runStartedAt: options?.startedAt ?? null,
    }),
  setActiveRunStatus: (status) => set({ activeRunStatus: status }),
  setActiveThread: (id) => set({ activeThreadId: id }),
  setCreditsRemaining: (credits) => set({ creditsRemaining: credits }),
  setDraftPlanModeEnabled: (enabled) => set({ draftPlanModeEnabled: enabled }),
  setError: (error) => set({ error }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setIsOpen: (open) => {
    persistPanelPreference(open);
    set((state) => ({
      isOpen: open,
      userChangedAgentDuringOverlay:
        state.overlayActiveIds.length > 0
          ? true
          : state.userChangedAgentDuringOverlay,
    }));
  },
  setLatestProposedPlan: (plan) => set({ latestProposedPlan: plan }),
  setMemoryEntries: (entries) => set({ memoryEntries: entries }),
  setMessages: (messages) =>
    set({
      latestProposedPlan: deriveLatestProposedPlanFromMessages(messages),
      messages,
    }),
  setModelCosts: (costs) => set({ modelCosts: costs }),
  setOnboardingChecklist: (payload) =>
    set({
      onboardingCompletionPercent: payload.completionPercent ?? 0,
      onboardingEarnedCredits: payload.earnedCredits ?? 0,
      onboardingSignupGiftCredits: payload.signupGiftCredits ?? 0,
      onboardingSteps: payload.steps,
      onboardingTotalJourneyCredits: payload.totalJourneyCredits ?? 100,
      onboardingTotalVisibleCredits:
        payload.totalOnboardingCreditsVisible ??
        (payload.signupGiftCredits ?? 0) + (payload.totalJourneyCredits ?? 100),
    }),
  setOnboardingStepStatus: (stepId, status) =>
    set((state) => ({
      onboardingSteps: state.onboardingSteps.map((step) =>
        step.id === stepId ? { ...step, status } : step,
      ),
    })),
  setPageContext: (context) => set({ pageContext: context }),
  setPendingInputRequest: (request) => set({ pendingInputRequest: request }),
  setRunStartedAt: (startedAt) => set({ runStartedAt: startedAt }),
  setSocketConnectionState: (socketConnectionState) =>
    set({ socketConnectionState }),
  setStreamingReasoning: (content) =>
    set((state) => ({
      stream: { ...state.stream, streamingReasoning: content },
    })),
  setThreadPrompt: (threadId, prompt) =>
    set((state) => ({
      threadPrompts: {
        ...state.threadPrompts,
        [threadId]: prompt,
      },
    })),
  setThreads: (threads) => set({ threads }),
  setThreadUiBusy: (threadId, busy) =>
    set((state) => {
      if (!threadId) {
        return state;
      }

      if (busy) {
        return {
          threadUiBusyById: {
            ...state.threadUiBusyById,
            [threadId]: true,
          },
        };
      }

      const { [threadId]: _, ...remaining } = state.threadUiBusyById;
      return {
        threadUiBusyById: remaining,
      };
    }),
  setWorkEvents: (events) => set({ workEvents: events }),
  socketConnectionState: 'connecting',
  stream: { ...DEFAULT_STREAM_STATE },
  threadPrompts: {},
  threads: [],
  threadUiBusyById: {},
  toggleOpen: () =>
    set(() => {
      const state = get();
      const next = !state.isOpen;
      persistPanelPreference(next);
      return {
        isOpen: next,
        userChangedAgentDuringOverlay:
          state.overlayActiveIds.length > 0
            ? true
            : state.userChangedAgentDuringOverlay,
      };
    }),
  updateActiveToolCall: (toolCallId, update) =>
    set((state) => ({
      stream: {
        ...state.stream,
        activeToolCalls: state.stream.activeToolCalls.map((tc) =>
          tc.id === toolCallId ? { ...tc, ...update } : tc,
        ),
      },
    })),
  updateThread: (threadId, update) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...update } : thread,
      ),
    })),
  upsertThread: (thread) =>
    set((state) => {
      const existingIndex = state.threads.findIndex(
        (item) => item.id === thread.id,
      );

      if (existingIndex === -1) {
        return { threads: [thread, ...state.threads] };
      }

      const next = [...state.threads];
      next[existingIndex] = { ...next[existingIndex], ...thread };
      return { threads: next };
    }),
  userChangedAgentDuringOverlay: false,
  wasAgentOpenBeforeOverlay: false,
  workEvents: [],
}));
