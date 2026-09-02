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
import type { AgentMessagesPage } from '@genfeedai/agent/services/agent-api/agent-api.threads';
import type { AgentPageContextState } from '@genfeedai/agent/utils/agent-page-context.util';
import { sortThreads } from '@genfeedai/agent/utils/sort-agent-threads.util';
import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';
import type {
  OnboardingChecklistStatus,
  OnboardingChecklistStep,
} from '@genfeedai/props/ui/agent/agent-onboarding.props';
import { AGENT_PANEL_OPEN_KEY } from '@genfeedai/services/core/agent-overlay-coordination.service';
import {
  adoptNewScopeSetup,
  buildAgentGenerationSetupScope,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Terminal session types (T1-T2 / T6)
// ---------------------------------------------------------------------------

export type TerminalSessionKind = 'claude' | 'codex' | 'genfeed' | 'shell';

export interface TerminalSessionDto {
  /** Working directory the process was started in. */
  cwd: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Unique session identifier. */
  id: string;
  /** Session kind. */
  kind: TerminalSessionKind;
  /** Bound thread, if any. */
  threadId?: string;
}

/** Key is `threadId` or the literal `"global"` for unthreaded sessions. */
export type TerminalSessionsByThread = Map<string, TerminalSessionDto[]>;

const TERMINAL_SESSIONS_STORAGE_KEY = 'genfeed:terminal:sessions';

function loadPersistedSessionsByThread(): TerminalSessionsByThread {
  if (typeof window === 'undefined') {
    return new Map();
  }

  try {
    const raw = window.localStorage.getItem(TERMINAL_SESSIONS_STORAGE_KEY);
    if (!raw) {
      return new Map();
    }

    const parsed = JSON.parse(raw) as Array<[string, TerminalSessionDto[]]>;
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function persistSessionsByThread(map: TerminalSessionsByThread): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      TERMINAL_SESSIONS_STORAGE_KEY,
      JSON.stringify([...map.entries()]),
    );
  } catch {
    // Ignore write errors (private-browsing quota, etc.)
  }
}

// Inlined from @genfeedai/contracts/types to avoid turbopack resolution issues
const ONBOARDING_SIGNUP_GIFT_CREDITS = 100;
const ONBOARDING_TOTAL_VISIBLE_CREDITS = 600;

export { AGENT_PANEL_OPEN_KEY };

function readPanelPreference(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const raw = window.localStorage.getItem(AGENT_PANEL_OPEN_KEY);
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
  } catch {
    // Private mode / quota — default collapsed.
  }

  // Collapsed by default — matches shipcode TerminalDrawer.
  return false;
}

function persistPanelPreference(isOpen: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(AGENT_PANEL_OPEN_KEY, String(isOpen));
  } catch {
    // Ignore write errors (private-browsing quota, etc.)
  }
}

export type AgentSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

const DEFAULT_ONBOARDING_STEPS: OnboardingChecklistStep[] = [
  {
    ctaHref: '/onboarding/brand',
    ctaLabel: 'Continue onboarding',
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
    ctaHref: '/onboarding/providers',
    ctaLabel: 'Configure providers',
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
    ctaHref: '/onboarding/providers',
    ctaLabel: 'Configure providers',
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
    ctaHref: '/onboarding/providers',
    ctaLabel: 'Configure providers',
    description: 'Generate your first video to unlock richer content creation.',
    id: 'generate_first_video',
    isClaimed: false,
    isRecommended: false,
    rewardCredits: 20,
    status: 'pending',
    title: 'Generate your first video',
  },
  {
    ctaHref: '/onboarding/providers',
    ctaLabel: 'Configure providers',
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

/**
 * What a thread's conversation looked like when the user last left it.
 *
 * Switching threads used to blank the track and hold it blank for the whole
 * round trip, so every revisit of a thread the user had just read cost a full
 * fetch of data the browser already had. Re-showing this snapshot makes the
 * switch paint instantly; the in-flight fetch still lands and replaces it.
 *
 * Stream state is deliberately excluded — a half-streamed turn must never be
 * restored as if it were settled history.
 */
interface CachedConversation {
  /** `Date.now()` when this entry was written — drives freshness (below). */
  cachedAt: number;
  error: string | null;
  latestProposedPlan: AgentProposedPlan | null;
  hasMoreMessages: boolean;
  messages: AgentChatMessage[];
  messagesCursor: string | null;
  pendingInputRequest: AgentInputRequest | null;
  workEvents: AgentWorkEvent[];
}

/**
 * Threads retained in the conversation cache. Bounded so a long session cannot
 * pin every thread's messages in memory; the least recently cached entry is
 * evicted first.
 *
 * Raised from 10 (#2790): hover/focus prefetch now populates this cache
 * passively while the user scans the thread list, not only when they
 * actually visit a thread — a ceiling sized for "threads visited" was too
 * tight for "threads hovered" and would evict a just-primed entry before the
 * click that was supposed to benefit from it. Each entry starts with one
 * bounded message page; older pages are retained only when the user backfills
 * them, keeping the passive-prefetch memory increase modest.
 */
export const CONVERSATION_CACHE_LIMIT = 20;

/**
 * A cached conversation counts as fresh for this long after it was written
 * (#2790). Within the window, switching to that thread skips the
 * thread-metadata and snapshot requests (`getThreadEffect` /
 * `getThreadSnapshotEffect`) entirely — the messages list still refetches
 * (nothing else can supply it, and it is what gates paint). Deliberately
 * short and time-bounded rather than "cache forever": a thread whose status,
 * plan, or work events changed server-side while the tab was open still
 * converges within one window's length of the user returning to it.
 */
export const CONVERSATION_CACHE_FRESHNESS_MS = 20_000;

interface AgentChatState {
  activeRunId: string | null;
  draftPlanModeEnabled: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  messages: AgentChatMessage[];
  hasMoreMessages: boolean;
  messagesCursor: string | null;
  isLoadingOlderMessages: boolean;
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
  pageContext: AgentPageContextState | null;
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
  /** Per-thread terminal sessions. Key = threadId | "global". */
  terminalSessionsByThread: TerminalSessionsByThread;
  /** Per-thread active session id. Key = threadId | "global". */
  activeTerminalSessionByThread: Record<string, string>;
  /** Last-seen conversation per thread, for instant re-paint on switch. */
  conversationCacheByThread: Record<string, CachedConversation>;
}

interface AgentChatActions {
  addPendingUiActions: (actions: AgentUiAction[]) => void;
  addWorkEvent: (event: AgentWorkEvent) => void;
  addMessage: (message: AgentChatMessage) => void;
  setUiActionStatus: (actionId: string, status: string) => void;
  clearStaleActiveRun: () => void;
  clearPendingInputRequest: () => void;
  setMessages: (messages: AgentChatMessage[]) => void;
  setMessagesPage: (page: AgentMessagesPage) => void;
  prependOlderMessages: (page: AgentMessagesPage) => void;
  setIsLoadingOlderMessages: (loading: boolean) => void;
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
  /** Snapshot the visible conversation so returning to `threadId` is instant. */
  cacheConversation: (threadId: string) => void;
  /** Re-show a cached conversation. Returns false when nothing was cached. */
  restoreCachedConversation: (threadId: string) => boolean;
  /** Drop every cached conversation — the scope they belonged to is gone. */
  clearConversationCache: () => void;
  /** Write prefetched data into the cache without disturbing the active thread. */
  primeConversationCache: (
    threadId: string,
    data: Omit<CachedConversation, 'cachedAt'>,
  ) => void;
  /** Whether `threadId`'s cache entry is recent enough to skip revalidation requests. */
  isConversationCacheFresh: (threadId: string) => boolean;
  toggleOpen: () => void;
  setPageContext: (context: AgentPageContextState | null) => void;
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
  // ---------------------------------------------------------------------------
  // Terminal session management (T1-T2 / T6)
  // ---------------------------------------------------------------------------
  /** Bulk-replace sessions map (called on terminal:list response + prune). */
  setTerminalSessionsByThread: (map: TerminalSessionsByThread) => void;
  /** Register a newly created session for a thread key. */
  addTerminalSession: (threadKey: string, session: TerminalSessionDto) => void;
  /** Remove a session (after terminal:kill). */
  removeTerminalSession: (threadKey: string, sessionId: string) => void;
  /** Set the active session for a thread key. */
  setActiveTerminalSession: (threadKey: string, sessionId: string) => void;
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

// A `requestAnimationFrame` per streamed token forces every historical
// timeline row to re-render/re-parse markdown dozens of times a second
// (#2517). rAF is throttled/paused on a hidden tab, so it is raced against
// this timer fallback rather than used alone. Whichever fires first flushes
// the buffer and cancels the other.
const STREAM_TOKEN_FLUSH_FALLBACK_MS = 50;

/**
 * Schedules `flush` to run once, via `requestAnimationFrame` (when available
 * — jsdom test environments do not polyfill it) raced against a `setTimeout`
 * fallback. Returns a cancel function that guarantees `flush` never runs
 * after it is called, even if a callback is already queued.
 */
function schedulePendingStreamFlush(flush: () => void): () => void {
  let hasRun = false;
  let rafHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const runOnce = () => {
    if (hasRun) {
      return;
    }
    hasRun = true;
    flush();
  };

  if (typeof requestAnimationFrame === 'function') {
    rafHandle = requestAnimationFrame(runOnce);
  }
  timeoutHandle = setTimeout(runOnce, STREAM_TOKEN_FLUSH_FALLBACK_MS);

  return () => {
    hasRun = true;
    if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafHandle);
    }
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  };
}

// Closure-scoped, non-reactive token buffer — deliberately outside the
// Zustand state tree. Tokens accumulate here between animation frames and are
// joined into a single `setState()` call on flush, so a fast stream no
// longer forces a state write (and therefore a timeline re-render) per
// token. `useAgentChatStore` is referenced lazily (only once these functions
// actually run) rather than destructuring `set`/`get` from the store
// factory, so this buffering logic never has to touch the factory's large
// object-literal body. The final assistant message is server-authoritative
// (`payload.fullContent` in agent-chat-stream.subscriptions.ts) — this
// buffer only ever affects the live-typing display, never the persisted
// message, so discarding it on reset is safe.
let pendingStreamTokens: string[] = [];
let cancelPendingStreamFlush: (() => void) | null = null;

function flushPendingStreamTokens(): void {
  cancelPendingStreamFlush = null;
  if (pendingStreamTokens.length === 0) {
    return;
  }
  const chunk = pendingStreamTokens.join('');
  pendingStreamTokens = [];
  useAgentChatStore.setState((state) => ({
    stream: {
      ...state.stream,
      streamingContent: state.stream.streamingContent + chunk,
    },
  }));
}

// Called from every `stream` reset path so a flush already in flight cannot
// land after the reset and resurrect stale streaming content.
function discardPendingStreamTokens(): void {
  pendingStreamTokens = [];
  if (cancelPendingStreamFlush) {
    cancelPendingStreamFlush();
    cancelPendingStreamFlush = null;
  }
}

export const useAgentChatStore = create<AgentChatStore>((set, get) => ({
  activeRunId: null,
  activeRunStatus: 'idle',
  activeThreadId: null,
  addActiveToolCall: (toolCall) =>
    set((state) => {
      const existingIndex = state.stream.activeToolCalls.findIndex(
        (item) => item.id === toolCall.id,
      );

      if (existingIndex === -1) {
        return {
          stream: {
            ...state.stream,
            activeToolCalls: [...state.stream.activeToolCalls, toolCall],
          },
        };
      }

      const activeToolCalls = [...state.stream.activeToolCalls];
      activeToolCalls[existingIndex] = {
        ...activeToolCalls[existingIndex],
        ...toolCall,
      };

      return {
        stream: {
          ...state.stream,
          activeToolCalls,
        },
      };
    }),
  addMemoryEntry: (entry) =>
    set((state) => ({ memoryEntries: [entry, ...state.memoryEntries] })),
  addMessage: (message) =>
    set((state) => ({
      latestProposedPlan:
        message.metadata?.proposedPlan ?? state.latestProposedPlan,
      messages: [...state.messages, message],
    })),
  setUiActionStatus: (actionId, status) =>
    set((state) => {
      let messagesChanged = false;
      const messages = state.messages.map((message) => {
        const uiActions = message.metadata?.uiActions;
        if (
          !uiActions?.some(
            (action) => action.id === actionId && action.status !== status,
          )
        ) {
          return message;
        }

        messagesChanged = true;
        return {
          ...message,
          metadata: {
            ...message.metadata,
            uiActions: uiActions.map((action) =>
              action.id === actionId ? { ...action, status } : action,
            ),
          },
        };
      });
      const pendingUiActions = state.stream.pendingUiActions.map((action) =>
        action.id === actionId && action.status !== status
          ? { ...action, status }
          : action,
      );
      const pendingChanged = pendingUiActions.some(
        (action, index) => action !== state.stream.pendingUiActions[index],
      );

      return {
        messages: messagesChanged ? messages : state.messages,
        stream: pendingChanged
          ? { ...state.stream, pendingUiActions }
          : state.stream,
      };
    }),
  addPendingUiActions: (actions) =>
    set((state) => {
      const pendingUiActions = [...state.stream.pendingUiActions];

      for (const action of actions) {
        const existingIndex = pendingUiActions.findIndex(
          (item) => item.id === action.id,
        );

        if (existingIndex === -1) {
          pendingUiActions.push(action);
        } else {
          pendingUiActions[existingIndex] = {
            ...pendingUiActions[existingIndex],
            ...action,
          };
        }
      }

      return {
        stream: {
          ...state.stream,
          pendingUiActions,
        },
      };
    }),
  addWorkEvent: (event) =>
    set((state) => {
      const existingIndex = state.workEvents.findIndex((item) => {
        if (item.id === event.id) {
          return true;
        }
        // Prefer toolCallId / inputRequestId matches so lifecycle updates
        // (started → progress → completed) collapse onto one event even if an
        // older client still minted event-prefixed ids.
        if (
          event.toolCallId &&
          item.toolCallId &&
          item.toolCallId === event.toolCallId
        ) {
          return true;
        }
        if (
          event.inputRequestId &&
          item.inputRequestId &&
          item.inputRequestId === event.inputRequestId
        ) {
          return true;
        }
        return false;
      });

      if (existingIndex === -1) {
        return { workEvents: [...state.workEvents, event] };
      }

      const next = [...state.workEvents];
      next[existingIndex] = {
        ...next[existingIndex],
        ...event,
        // Keep the original id so selectors stay stable across updates.
        id: next[existingIndex].id,
      };
      return { workEvents: next };
    }),
  appendStreamToken: (token) => {
    pendingStreamTokens.push(token);
    if (!cancelPendingStreamFlush) {
      cancelPendingStreamFlush = schedulePendingStreamFlush(
        flushPendingStreamTokens,
      );
    }
  },
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

      return {
        isOpen: false,
        overlayActiveIds: nextOverlayActiveIds,
        overlayAutoCollapsedAgent: true,
        userChangedAgentDuringOverlay: false,
        wasAgentOpenBeforeOverlay: true,
      };
    }),
  cacheConversation: (threadId) =>
    set((state) => {
      // Nothing worth re-showing, and caching an empty conversation would let a
      // later switch skip the loading skeleton while showing a blank track.
      if (state.messages.length === 0) {
        return state;
      }

      // Re-inserting moves the thread to the end of the key order, which is what
      // makes the eviction below least-recently-cached rather than arbitrary.
      const { [threadId]: _evicted, ...retained } =
        state.conversationCacheByThread;
      const next: Record<string, CachedConversation> = {
        ...retained,
        [threadId]: {
          cachedAt: Date.now(),
          error: state.error,
          hasMoreMessages: state.hasMoreMessages,
          latestProposedPlan: state.latestProposedPlan,
          messages: state.messages,
          messagesCursor: state.messagesCursor,
          pendingInputRequest: state.pendingInputRequest,
          workEvents: state.workEvents,
        },
      };

      const threadIds = Object.keys(next);
      for (const staleId of threadIds.slice(
        0,
        Math.max(0, threadIds.length - CONVERSATION_CACHE_LIMIT),
      )) {
        delete next[staleId];
      }

      return { conversationCacheByThread: next };
    }),
  clearComposerSeed: () => set({ composerSeed: null }),
  clearConversationCache: () => set({ conversationCacheByThread: {} }),
  clearMessages: () =>
    set({
      activeRunId: null,
      activeRunStatus: 'idle',
      composerSeed: null,
      draftPlanModeEnabled: false,
      error: null,
      latestProposedPlan: null,
      hasMoreMessages: false,
      isGenerating: false,
      isLoadingOlderMessages: false,
      messages: [],
      messagesCursor: null,
      pendingInputRequest: null,
      runStartedAt: null,
      threadUiBusyById: {},
      workEvents: [],
    }),
  clearStaleActiveRun: () => {
    discardPendingStreamTokens();
    set({
      activeRunId: null,
      activeRunStatus: 'idle',
      isGenerating: false,
      runStartedAt: null,
      stream: { ...DEFAULT_STREAM_STATE },
    });
  },
  clearPendingInputRequest: () => set({ pendingInputRequest: null }),
  clearThreadAttention: (threadId) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, attentionState: null } : thread,
      ),
    })),
  composerSeed: null,
  conversationCacheByThread: {},
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

      return {
        isOpen: shouldRestoreAgent ? true : state.isOpen,
        overlayActiveIds: [],
        overlayAutoCollapsedAgent: false,
        userChangedAgentDuringOverlay: false,
        wasAgentOpenBeforeOverlay: false,
      };
    }),
  error: null,
  finalizeStream: (message) => {
    // The assistant message below is server-authoritative
    // (`payload.fullContent` in agent-chat-stream.subscriptions.ts), never the
    // locally buffered `streamingContent` — a stale in-flight flush landing
    // after this must not resurrect pre-finalize streaming text (#2517).
    discardPendingStreamTokens();
    set((state) => {
      const mergedUiActions = [
        ...(message.metadata?.uiActions ?? []),
        ...state.stream.pendingUiActions,
      ].filter((action, index, actions) => {
        // Prefer later copies so tool_complete pending + done metadata with the
        // same semantic key collapse to one card.
        const lastWithKey = actions.findLastIndex((candidate) => {
          if (candidate.id && action.id && candidate.id === action.id) {
            return true;
          }
          // Snapshot cards re-minted with Date.now() ids still share type+title.
          if (
            candidate.type === action.type &&
            (action.type === 'analytics_snapshot_card' ||
              action.type === 'completion_summary_card') &&
            candidate.title === action.title
          ) {
            return true;
          }
          return false;
        });
        return lastWithKey === index;
      });

      return {
        activeRunId: null,
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
        // Clear tool lifecycle rows so sticky "Running get_analytics 15%" cannot
        // outlive the completed turn.
        runStartedAt: null,
        stream: { ...DEFAULT_STREAM_STATE },
        workEvents: [],
      };
    });
  },
  isConversationCacheFresh: (threadId) => {
    const cached = get().conversationCacheByThread[threadId];
    if (!cached) {
      return false;
    }
    return Date.now() - cached.cachedAt < CONVERSATION_CACHE_FRESHNESS_MS;
  },
  isGenerating: false,
  isLoadingOlderMessages: false,
  isOpen: readPanelPreference(),
  latestProposedPlan: null,
  hasMoreMessages: false,
  memoryEntries: [],
  messages: [],
  messagesCursor: null,
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
  primeConversationCache: (threadId, data) =>
    set((state) => {
      // The active thread's live state is the source of truth; a prefetch
      // that lands after the user has already navigated there must never
      // clobber it with a slightly-stale snapshot.
      if (threadId === state.activeThreadId) {
        return state;
      }

      // Same recency-by-reinsertion + LRU eviction as `cacheConversation`.
      const { [threadId]: _evicted, ...retained } =
        state.conversationCacheByThread;
      const next: Record<string, CachedConversation> = {
        ...retained,
        [threadId]: {
          ...data,
          cachedAt: Date.now(),
        },
      };

      const threadIds = Object.keys(next);
      for (const staleId of threadIds.slice(
        0,
        Math.max(0, threadIds.length - CONVERSATION_CACHE_LIMIT),
      )) {
        delete next[staleId];
      }

      return { conversationCacheByThread: next };
    }),
  removeMemoryEntry: (entryId) =>
    set((state) => ({
      memoryEntries: state.memoryEntries.filter((item) => item.id !== entryId),
    })),
  resetActiveConversationState: () => {
    discardPendingStreamTokens();
    set({
      activeRunId: null,
      activeRunStatus: 'idle',
      composerSeed: null,
      draftPlanModeEnabled: false,
      error: null,
      latestProposedPlan: null,
      hasMoreMessages: false,
      isGenerating: false,
      isLoadingOlderMessages: false,
      messages: [],
      messagesCursor: null,
      pendingInputRequest: null,
      runStartedAt: null,
      stream: { ...DEFAULT_STREAM_STATE },
      threadUiBusyById: {},
      workEvents: [],
    });
  },
  resetStreamState: () => {
    discardPendingStreamTokens();
    set((state) => ({
      activeRunStatus:
        state.activeRunStatus === 'cancelling' ? 'cancelling' : 'idle',
      stream: { ...DEFAULT_STREAM_STATE },
      workEvents: [],
    }));
  },
  restoreCachedConversation: (threadId) => {
    const cached = get().conversationCacheByThread[threadId];

    if (!cached) {
      return false;
    }

    // Mirrors resetActiveConversationState for everything the cache does not
    // carry, so no run/stream state leaks across from the thread being left.
    discardPendingStreamTokens();
    set({
      activeRunId: null,
      activeRunStatus: 'idle',
      composerSeed: null,
      draftPlanModeEnabled: false,
      error: cached.error,
      latestProposedPlan: cached.latestProposedPlan,
      hasMoreMessages: cached.hasMoreMessages,
      isGenerating: false,
      isLoadingOlderMessages: false,
      messages: cached.messages,
      messagesCursor: cached.messagesCursor,
      pendingInputRequest: cached.pendingInputRequest,
      runStartedAt: null,
      stream: { ...DEFAULT_STREAM_STATE },
      threadUiBusyById: {},
      workEvents: cached.workEvents,
    });

    return true;
  },
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
  setActiveThread: (id) =>
    set((state) => {
      // `/agent/new` creates the thread while the store still has `null`, then
      // the URL catches up. Keep the live stream for that handoff. Switching
      // from one real thread to another must not keep the previous generation
      // card in `pendingUiActions`.
      if (state.activeThreadId === id || !state.activeThreadId) {
        if (!state.activeThreadId && id) {
          // Carry the composer-built ("__new__") setup over onto the freshly
          // created thread's own scope, for both generation types the agent
          // composer can produce — mirrors adoptNewThreadGenerationPrefs.
          adoptNewScopeSetup(
            buildAgentGenerationSetupScope(state.activeThreadId, 'image'),
            buildAgentGenerationSetupScope(id, 'image'),
          );
          adoptNewScopeSetup(
            buildAgentGenerationSetupScope(state.activeThreadId, 'video'),
            buildAgentGenerationSetupScope(id, 'video'),
          );
        }
        return { activeThreadId: id };
      }

      return {
        activeThreadId: id,
        stream: { ...DEFAULT_STREAM_STATE },
      };
    }),
  setCreditsRemaining: (credits) => set({ creditsRemaining: credits }),
  setDraftPlanModeEnabled: (enabled) => set({ draftPlanModeEnabled: enabled }),
  setError: (error) =>
    set((state) => ({
      error,
      // Credit/limit failures should not leave the composer stuck on Stop.
      ...(error
        ? {
            activeRunStatus:
              state.activeRunStatus === 'running' ||
              state.activeRunStatus === 'cancelling'
                ? 'failed'
                : state.activeRunStatus,
            isGenerating: false,
          }
        : {}),
    })),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setIsLoadingOlderMessages: (loading) =>
    set({ isLoadingOlderMessages: loading }),
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
      hasMoreMessages: false,
      isLoadingOlderMessages: false,
      latestProposedPlan: deriveLatestProposedPlanFromMessages(messages),
      messages,
      messagesCursor: null,
    }),
  setMessagesPage: (page) =>
    set({
      hasMoreMessages: page.hasMore,
      isLoadingOlderMessages: false,
      latestProposedPlan: deriveLatestProposedPlanFromMessages(page.messages),
      messages: page.messages,
      messagesCursor: page.nextCursor,
    }),
  prependOlderMessages: (page) =>
    set((state) => {
      const currentIds = new Set(state.messages.map((message) => message.id));
      const olderMessages = page.messages.filter(
        (message) => !currentIds.has(message.id),
      );
      const messages = [...olderMessages, ...state.messages];

      return {
        hasMoreMessages: page.hasMore,
        latestProposedPlan: deriveLatestProposedPlanFromMessages(messages),
        messages,
        messagesCursor: page.nextCursor,
      };
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
  terminalSessionsByThread: loadPersistedSessionsByThread(),
  activeTerminalSessionByThread: {},
  setTerminalSessionsByThread: (map) => {
    persistSessionsByThread(map);
    set({ terminalSessionsByThread: new Map(map) });
  },
  addTerminalSession: (threadKey, session) =>
    set((state) => {
      const next = new Map(state.terminalSessionsByThread);
      const existing = next.get(threadKey) ?? [];
      if (!existing.some((s) => s.id === session.id)) {
        next.set(threadKey, [...existing, session]);
      }
      persistSessionsByThread(next);
      return { terminalSessionsByThread: next };
    }),
  removeTerminalSession: (threadKey, sessionId) =>
    set((state) => {
      const next = new Map(state.terminalSessionsByThread);
      const filtered = (next.get(threadKey) ?? []).filter(
        (s) => s.id !== sessionId,
      );
      if (filtered.length === 0) {
        next.delete(threadKey);
      } else {
        next.set(threadKey, filtered);
      }
      persistSessionsByThread(next);

      // If the active session was killed, fall back to the first remaining one
      const currentActive = state.activeTerminalSessionByThread[threadKey];
      if (currentActive === sessionId) {
        const nextActive = filtered[0];
        const nextActiveMap = { ...state.activeTerminalSessionByThread };
        if (nextActive) {
          nextActiveMap[threadKey] = nextActive.id;
        } else {
          delete nextActiveMap[threadKey];
        }
        return {
          terminalSessionsByThread: next,
          activeTerminalSessionByThread: nextActiveMap,
        };
      }

      return { terminalSessionsByThread: next };
    }),
  setActiveTerminalSession: (threadKey, sessionId) =>
    set((state) => ({
      activeTerminalSessionByThread: {
        ...state.activeTerminalSessionByThread,
        [threadKey]: sessionId,
      },
    })),
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
      threads: sortThreads(
        state.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                ...update,
                updatedAt:
                  update.updatedAt ?? update.lastActivityAt ?? thread.updatedAt,
              }
            : thread,
        ),
      ),
    })),
  upsertThread: (thread) =>
    set((state) => {
      if (!isRenderableThreadId(thread.id)) {
        // Never store threads without a usable id — they would render as
        // /agent/undefined links downstream.
        return state;
      }

      const existingIndex = state.threads.findIndex(
        (item) => item.id === thread.id,
      );
      const next =
        existingIndex === -1
          ? [thread, ...state.threads]
          : state.threads.map((item, index) =>
              index === existingIndex ? { ...item, ...thread } : item,
            );

      return { threads: sortThreads(next) };
    }),
  userChangedAgentDuringOverlay: false,
  wasAgentOpenBeforeOverlay: false,
  workEvents: [],
}));
