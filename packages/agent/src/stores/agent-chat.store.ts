import type {
  AgentChatMessage,
  AgentInputRequest,
  AgentMemoryEntry,
  AgentProposedPlan,
  AgentThread,
  AgentThreadSnapshot,
  AgentThreadUiActionRun,
  AgentThreadUiActionState,
  AgentToolCall,
  AgentTurnAcceptedPayload,
  AgentUiAction,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentMessagesPage } from '@genfeedai/agent/services/agent-api/agent-api.threads';
import type { AgentPageContextState } from '@genfeedai/agent/utils/agent-page-context.util';
import {
  resolveRunSummaryPatch,
  resolveStatusPushPatch,
} from '@genfeedai/agent/utils/agent-thread-run-summary.util';
import {
  deriveLatestProposedPlan,
  resolveLatestProposedPlan,
} from '@genfeedai/agent/utils/resolve-latest-proposed-plan.util';
import { sortThreads } from '@genfeedai/agent/utils/sort-agent-threads.util';
import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';
import {
  type AgentThreadMode,
  DEFAULT_AGENT_THREAD_MODE,
} from '@genfeedai/contracts';
import {
  type AgentThreadStatusEvent,
  deriveAgentUiActionStates,
  isAgentUiActionSourceOwner,
} from '@genfeedai/contracts/interfaces';
import {
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  ONBOARDING_SIGNUP_GIFT_CREDITS,
  ONBOARDING_TOTAL_VISIBLE_CREDITS,
} from '@genfeedai/contracts/types/onboarding-journey';
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

const DEFAULT_ONBOARDING_STEPS: OnboardingChecklistStep[] =
  ONBOARDING_JOURNEY_MISSIONS.map(
    (mission, index): OnboardingChecklistStep => ({
      ctaHref: mission.ctaHref,
      ctaLabel: mission.ctaLabel,
      description: mission.description,
      id: mission.id,
      isClaimed: false,
      isRecommended: index === 0,
      rewardCredits: mission.rewardCredits,
      status: 'pending',
      title: mission.label,
    }),
  );

interface AgentStreamState {
  acceptedReceipt?: AgentTurnAcceptedPayload;
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
 * thread-metadata and snapshot requests (`getThread` /
 * `getThreadSnapshot`) entirely — the messages list still refetches
 * (nothing else can supply it, and it is what gates paint). Deliberately
 * short and time-bounded rather than "cache forever": a thread whose status,
 * plan, or work events changed server-side while the tab was open still
 * converges within one window's length of the user returning to it.
 */
export const CONVERSATION_CACHE_FRESHNESS_MS = 20_000;

export type AgentRunStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_input'
  | 'awaiting_confirmation'
  | 'interrupted'
  | 'restoring';

/** One thread's run, the single record the run fields derive from. */
export interface AgentRunRecord {
  isGenerating: boolean;
  runId: string | null;
  startedAt: string | null;
  status: AgentRunStatus;
}

/** `runsByThread` key for the not-yet-created thread (`activeThreadId: null`). */
export const DRAFT_RUN_KEY = '__new__';

const IDLE_RUN: AgentRunRecord = {
  isGenerating: false,
  runId: null,
  startedAt: null,
  status: 'idle',
};

export type AgentRunEvent =
  /** A run began or was restored (`setActiveRun`). */
  | {
      type: 'begin';
      runId: string | null;
      startedAt?: string | null;
      status?: AgentRunStatus;
    }
  /** The run's status moved, same run (`setActiveRunStatus`, input resolved). */
  | { type: 'status'; status: AgentRunStatus }
  /** The explicit `isGenerating` flag was set. */
  | { type: 'generating'; isGenerating: boolean }
  /** The turn finished with a final assistant message. */
  | { type: 'complete' }
  /** A surfaced error settles a live run as failed and clears generating. */
  | { type: 'error' }
  /** The stream was torn down; a cancel in flight stays cancelling. */
  | { type: 'stream-reset' }
  /** The conversation was cleared or the run is gone. */
  | { type: 'reset' };

type RunStateSlice = Pick<
  AgentChatState,
  | 'activeRunId'
  | 'activeRunStatus'
  | 'activeThreadId'
  | 'isGenerating'
  | 'runStartedAt'
  | 'runsByThread'
  | 'threads'
>;

export function runKeyFor(threadId: string | null): string {
  return threadId ?? DRAFT_RUN_KEY;
}

function recordOf(state: RunStateSlice, threadId: string | null) {
  const key = runKeyFor(threadId);
  // The visible thread's compatibility fields can be written from outside the
  // store (stream projection), so they are the freshest copy of its record.
  return key === runKeyFor(state.activeThreadId)
    ? {
        isGenerating: state.isGenerating,
        runId: state.activeRunId,
        startedAt: state.runStartedAt,
        status: state.activeRunStatus,
      }
    : (state.runsByThread[key] ?? IDLE_RUN);
}

function applyRunEvent(
  record: AgentRunRecord,
  event: AgentRunEvent,
): AgentRunRecord {
  switch (event.type) {
    case 'begin':
      return {
        ...record,
        runId: event.runId,
        startedAt: event.startedAt ?? null,
        status: event.status ?? (event.runId ? 'running' : 'idle'),
      };
    case 'status':
      return { ...record, status: event.status };
    case 'generating':
      return { ...record, isGenerating: event.isGenerating };
    case 'complete':
      return { ...record, runId: null, startedAt: null, status: 'completed' };
    case 'error':
      return {
        ...record,
        isGenerating: false,
        status:
          record.status === 'running' || record.status === 'cancelling'
            ? 'failed'
            : record.status,
      };
    case 'stream-reset':
      return {
        ...record,
        status: record.status === 'cancelling' ? 'cancelling' : 'idle',
      };
    case 'reset':
      return IDLE_RUN;
  }
}

/**
 * The one place run state changes. Moves `threadId`'s record and, when that is
 * the visible thread, projects it onto `activeRunId` / `activeRunStatus` /
 * `isGenerating` / `runStartedAt` in the same patch, so the fields cannot
 * disagree. A background thread's transition never touches the visible
 * thread's fields.
 */
export function runTransitionPatch(
  state: RunStateSlice,
  threadId: string | null,
  event: AgentRunEvent,
): Pick<AgentChatState, 'runsByThread'> &
  Partial<
    Pick<
      AgentChatState,
      | 'activeRunId'
      | 'activeRunStatus'
      | 'isGenerating'
      | 'runStartedAt'
      | 'threads'
    >
  > {
  const key = runKeyFor(threadId);
  const previous = recordOf(state, threadId);
  const next = applyRunEvent(previous, event);
  const runsByThread = { ...state.runsByThread, [key]: next };

  // The sidebar reads only the thread summary, so the transitioned thread's
  // row moves in the same update — visible or not.
  const summary = threadId
    ? state.threads.find((thread) => thread.id === threadId)
    : undefined;
  const summaryPatch =
    summary && next.status !== previous.status
      ? resolveRunSummaryPatch(next.status, summary)
      : null;
  const threads = summaryPatch
    ? state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...summaryPatch } : thread,
      )
    : undefined;

  if (key !== runKeyFor(state.activeThreadId)) {
    return threads ? { runsByThread, threads } : { runsByThread };
  }
  return {
    ...(threads ? { threads } : {}),
    activeRunId: next.runId,
    activeRunStatus: next.status,
    isGenerating: next.isGenerating,
    runStartedAt:
      event.type === 'begin' ||
      event.type === 'complete' ||
      event.type === 'reset'
        ? next.startedAt
        : state.runStartedAt,
    runsByThread,
  };
}

/** The visible thread's run record. */
export function selectActiveRun(state: RunStateSlice): AgentRunRecord {
  return state.runsByThread[runKeyFor(state.activeThreadId)] ?? IDLE_RUN;
}

export function selectIsGenerating(state: RunStateSlice): boolean {
  return selectActiveRun(state).isGenerating;
}

interface AgentChatState {
  activeRunId: string | null;
  draftAgentMode: AgentThreadMode;
  /**
   * Runtime picked for the next new thread (e.g. `local/claude-cli` in
   * Genfeed Desktop). Applied when that thread is created.
   */
  draftRuntimeKey: string | null;
  savedAgentMode: AgentThreadMode | null;
  hasExplicitDraftAgentMode: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  messages: AgentChatMessage[];
  hasMoreMessages: boolean;
  messagesCursor: string | null;
  isLoadingOlderMessages: boolean;
  memoryEntries: AgentMemoryEntry[];
  threads: AgentThread[];
  activeThreadId: string | null;
  activeRunStatus: AgentRunStatus;
  isGenerating: boolean;
  /** Per-thread run records; key = threadId | DRAFT_RUN_KEY. */
  runsByThread: Record<string, AgentRunRecord>;
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
  /**
   * Ui-action runs per thread, by run id. Written only from the thread's
   * projection (snapshot hydration) and each run's own events (its ack,
   * `agent:done` / `agent:error`, or the completion watchdog settling it), so
   * cards derive the same state after a remount or a thread switch.
   */
  uiActionRunsByThread: Record<string, Record<string, AgentThreadUiActionRun>>;
  /**
   * The card view of `uiActionRunsByThread`, by `getAgentUiActionStateKey`,
   * derived with the same rule as the server (`deriveAgentUiActionStates`).
   */
  uiActionStatesByThread: Record<
    string,
    Record<string, AgentThreadUiActionState>
  >;
  /** The last thread event sequence applied to each thread. */
  threadEventSequenceById: Record<string, number>;
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
  /**
   * Set a card's status wherever it is loaded. `update`, the server-resolved
   * copy of that card, also replaces its fields.
   */
  setUiActionStatus: (
    actionId: string,
    status: string,
    update?: AgentUiAction,
  ) => void;
  clearStaleActiveRun: () => void;
  clearPendingInputRequest: (inputRequestId?: string) => void;
  resolvePendingInputRequest: (
    threadId: string,
    inputRequestId: string,
    timestamp: string,
  ) => boolean;
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
  transitionRun: (threadId: string | null, event: AgentRunEvent) => void;
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
  /**
   * Treat a run adopted from the server (reload, navigation, reconnect) as a
   * live stream, so the working row renders and the stream hook re-attaches.
   */
  markStreamLive: () => void;
  resetStreamState: () => void;
  setSocketConnectionState: (state: AgentSocketConnectionState) => void;
  updateThread: (threadId: string, update: Partial<AgentThread>) => void;
  /**
   * Apply a server-pushed run status to a thread's row, in place: position and
   * `updatedAt` do not move (#5636). Applies only when `event.sequence` is
   * newer than what the row holds (`statusSequence`) and than
   * `streamSequenceFloor`, the thread event sequence a live stream this client
   * owns has already reached. Returns why an event did not apply.
   */
  applyThreadStatusPush: (
    event: AgentThreadStatusEvent,
    streamSequenceFloor?: number,
  ) => 'applied' | 'stale' | 'unknown-thread';
  clearThreadAttention: (threadId: string) => void;
  seedComposer: (content: string, threadId?: string | null) => void;
  clearComposerSeed: () => void;
  setDraftAgentMode: (mode: AgentThreadMode) => void;
  setDraftRuntimeKey: (runtimeKey: string | null) => void;
  setLatestProposedPlan: (plan: AgentProposedPlan | null) => void;
  setThreadUiBusy: (threadId: string, busy: boolean) => void;
  /**
   * Whether a live event at `sequence` is newer than what the thread already
   * reflects; when it is, the thread advances to it. An event without a
   * sequence (an older server) always applies.
   */
  acceptThreadEventSequence: (threadId: string, sequence?: number) => boolean;
  /** Adopt a thread's projected ui-action runs and event position. */
  applyThreadSnapshotState: (
    threadId: string,
    snapshot: Pick<AgentThreadSnapshot, 'activeRun' | 'lastSequence'> & {
      uiActionRuns?: AgentThreadUiActionRun[];
    },
  ) => void;
  /** Record the run an acknowledged ui-action started as pending. */
  trackUiActionRun: (
    threadId: string,
    run: { action: string; runId: string; sourceId: string },
  ) => void;
  /**
   * Whether a settled run's result may update its source card: the run is the
   * one the source shows (`isAgentUiActionSourceOwner`). Settle the run first.
   */
  isUiActionSourceOwner: (
    threadId: string,
    result: { runId: string; sequence?: number; sourceId: string },
  ) => boolean;
  /** Settle the pending ui-action run `runId`, if there is one. */
  settleUiActionRun: (
    threadId: string,
    runId: string,
    outcome: {
      error?: string;
      sequence?: number;
      status: Exclude<AgentThreadUiActionState['status'], 'pending'>;
    },
  ) => void;
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

/** A thread's ui-action runs, with the card view derived from them. */
function withUiActionRuns(
  state: Pick<
    AgentChatState,
    'uiActionRunsByThread' | 'uiActionStatesByThread'
  >,
  threadId: string,
  runs: Record<string, AgentThreadUiActionRun>,
): Pick<AgentChatState, 'uiActionRunsByThread' | 'uiActionStatesByThread'> {
  return {
    uiActionRunsByThread: { ...state.uiActionRunsByThread, [threadId]: runs },
    uiActionStatesByThread: {
      ...state.uiActionStatesByThread,
      [threadId]: deriveAgentUiActionStates(Object.values(runs)),
    },
  };
}

function deriveLatestProposedPlanFromMessages(
  messages: AgentChatMessage[],
): AgentProposedPlan | null {
  return deriveLatestProposedPlan(
    messages.map((message) => message.metadata?.proposedPlan),
  );
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
export function createAgentChatStore(options: { ephemeral?: boolean } = {}) {
  let pendingStreamTokens: string[] = [];
  let pendingStreamOwner: {
    threadId: string | null;
    runId: string | null;
  } | null = null;
  let cancelPendingStreamFlush: (() => void) | null = null;

  function flushPendingStreamTokens(): void {
    cancelPendingStreamFlush = null;
    if (pendingStreamTokens.length === 0) {
      return;
    }
    const owner = pendingStreamOwner;
    if (
      !owner ||
      owner.threadId !== store.getState().activeThreadId ||
      owner.runId !== store.getState().activeRunId
    ) {
      pendingStreamTokens = [];
      return;
    }
    const chunk = pendingStreamTokens.join('');
    pendingStreamTokens = [];
    store.setState((state) => ({
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

  const store = create<AgentChatStore>((set, get) => ({
    activeRunId: null,
    activeRunStatus: 'idle',
    activeThreadId: null,
    runsByThread: {},
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
        latestProposedPlan: resolveLatestProposedPlan(
          state.latestProposedPlan,
          message.metadata?.proposedPlan,
        ),
        messages: [...state.messages, message],
      })),
    setUiActionStatus: (actionId, status, update) =>
      set((state) => {
        // A server-resolved copy of the card (same id and type) replaces its
        // fields in place; otherwise only the status moves.
        const apply = (action: AgentUiAction): AgentUiAction => {
          if (action.id !== actionId) {
            return action;
          }
          if (update && update.type === action.type) {
            return {
              ...action,
              ...update,
              data: { ...action.data, ...update.data },
              id: actionId,
              status,
            };
          }
          return action.status === status ? action : { ...action, status };
        };
        let messagesChanged = false;
        const messages = state.messages.map((message) => {
          const uiActions = message.metadata?.uiActions;
          if (!uiActions) {
            return message;
          }
          const nextActions = uiActions.map(apply);
          if (
            nextActions.every((action, index) => action === uiActions[index])
          ) {
            return message;
          }
          messagesChanged = true;
          return {
            ...message,
            metadata: { ...message.metadata, uiActions: nextActions },
          };
        });
        const pendingUiActions = state.stream.pendingUiActions.map(apply);
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
      const state = get();
      if (
        pendingStreamOwner?.threadId !== state.activeThreadId ||
        pendingStreamOwner?.runId !== state.activeRunId
      ) {
        discardPendingStreamTokens();
      }
      pendingStreamOwner = {
        threadId: state.activeThreadId,
        runId: state.activeRunId,
      };
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
      set((state) => ({
        ...runTransitionPatch(state, state.activeThreadId, { type: 'reset' }),
        composerSeed: null,
        draftAgentMode: get().savedAgentMode ?? DEFAULT_AGENT_THREAD_MODE,
        hasExplicitDraftAgentMode: false,
        error: null,
        latestProposedPlan: null,
        hasMoreMessages: false,
        isLoadingOlderMessages: false,
        messages: [],
        messagesCursor: null,
        pendingInputRequest: null,
        threadUiBusyById: {},
        workEvents: [],
      })),
    clearStaleActiveRun: () => {
      discardPendingStreamTokens();
      set((state) => ({
        ...runTransitionPatch(state, state.activeThreadId, { type: 'reset' }),
        stream: { ...DEFAULT_STREAM_STATE },
        // The run is gone server-side. The thread summary is what the sidebar
        // trusts for "Working", so settle it here or it would stay there.
        threads: state.threads.map((thread) =>
          thread.id === state.activeThreadId &&
          (thread.runStatus === 'queued' || thread.runStatus === 'running')
            ? { ...thread, attentionState: null, runStatus: 'idle' }
            : thread,
        ),
      }));
    },
    clearPendingInputRequest: (inputRequestId) =>
      set((state) =>
        !inputRequestId ||
        state.pendingInputRequest?.inputRequestId === inputRequestId
          ? { pendingInputRequest: null }
          : {},
      ),
    resolvePendingInputRequest: (threadId, inputRequestId, timestamp) => {
      let resolved = false;
      set((state) => {
        if (
          state.activeThreadId !== threadId ||
          state.pendingInputRequest?.threadId !== threadId ||
          state.pendingInputRequest.inputRequestId !== inputRequestId
        )
          return state;
        resolved = true;
        return {
          pendingInputRequest: null,
          ...runTransitionPatch(state, threadId, {
            status: 'running',
            type: 'status',
          }),
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  attentionState: 'running',
                  lastActivityAt: timestamp,
                  pendingInputCount: 0,
                  runStatus: 'running',
                }
              : thread,
          ),
        };
      });
      return resolved;
    },
    clearThreadAttention: (threadId) =>
      set((state) => ({
        threads: state.threads.map((thread) =>
          thread.id === threadId ? { ...thread, attentionState: null } : thread,
        ),
      })),
    composerSeed: null,
    conversationCacheByThread: {},
    creditsRemaining: null,
    draftAgentMode: DEFAULT_AGENT_THREAD_MODE,
    draftRuntimeKey: null,
    savedAgentMode: null,
    hasExplicitDraftAgentMode: false,
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
          ...runTransitionPatch(state, state.activeThreadId, {
            type: 'complete',
          }),
          latestProposedPlan: resolveLatestProposedPlan(
            state.latestProposedPlan,
            message.metadata?.proposedPlan,
          ),
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
          stream: { ...DEFAULT_STREAM_STATE },
          workEvents: [],
        };
      });
    },
    markStreamLive: () =>
      set((state) =>
        state.stream.isStreaming
          ? state
          : { stream: { ...state.stream, isStreaming: true } },
      ),
    isConversationCacheFresh: (threadId) => {
      const cached = get().conversationCacheByThread[threadId];
      if (!cached) {
        return false;
      }
      return Date.now() - cached.cachedAt < CONVERSATION_CACHE_FRESHNESS_MS;
    },
    isGenerating: false,
    isLoadingOlderMessages: false,
    isOpen: options.ephemeral ? false : readPanelPreference(),
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
    onboardingTotalJourneyCredits: ONBOARDING_JOURNEY_TOTAL_CREDITS,
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
        memoryEntries: state.memoryEntries.filter(
          (item) => item.id !== entryId,
        ),
      })),
    resetActiveConversationState: () => {
      discardPendingStreamTokens();
      set((state) => ({
        ...runTransitionPatch(state, state.activeThreadId, { type: 'reset' }),
        composerSeed: null,
        draftAgentMode: get().savedAgentMode ?? DEFAULT_AGENT_THREAD_MODE,
        hasExplicitDraftAgentMode: false,
        error: null,
        latestProposedPlan: null,
        hasMoreMessages: false,
        isLoadingOlderMessages: false,
        messages: [],
        messagesCursor: null,
        pendingInputRequest: null,
        stream: { ...DEFAULT_STREAM_STATE },
        threadUiBusyById: {},
        workEvents: [],
      }));
    },
    resetStreamState: () => {
      discardPendingStreamTokens();
      set((state) => ({
        ...runTransitionPatch(state, state.activeThreadId, {
          type: 'stream-reset',
        }),
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
      set((state) => ({
        ...runTransitionPatch(state, state.activeThreadId, { type: 'reset' }),
        composerSeed: null,
        draftAgentMode:
          get().threads.find((thread) => thread.id === threadId)?.mode ??
          get().savedAgentMode ??
          DEFAULT_AGENT_THREAD_MODE,
        hasExplicitDraftAgentMode: false,
        error: cached.error,
        latestProposedPlan: cached.latestProposedPlan,
        hasMoreMessages: cached.hasMoreMessages,
        isLoadingOlderMessages: false,
        messages: cached.messages,
        messagesCursor: cached.messagesCursor,
        pendingInputRequest: cached.pendingInputRequest,
        stream: { ...DEFAULT_STREAM_STATE },
        threadUiBusyById: {},
        workEvents: cached.workEvents,
      }));

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
      set((state) =>
        runTransitionPatch(state, state.activeThreadId, {
          runId,
          startedAt: options?.startedAt,
          status: options?.status,
          type: 'begin',
        }),
      ),
    setActiveRunStatus: (status) =>
      set((state) =>
        runTransitionPatch(state, state.activeThreadId, {
          status,
          type: 'status',
        }),
      ),
    transitionRun: (threadId, event) =>
      set((state) => runTransitionPatch(state, threadId, event)),
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
          // The draft thread's run record moves to the thread it became.
          if (!state.activeThreadId && id) {
            const { [DRAFT_RUN_KEY]: draftRun, ...otherRuns } =
              state.runsByThread;
            return {
              activeThreadId: id,
              runsByThread: draftRun
                ? { ...otherRuns, [id]: draftRun }
                : state.runsByThread,
            };
          }
          return { activeThreadId: id };
        }

        // The departing thread keeps its record (a run can finish in the
        // background) and the destination shows its own, idle when unknown
        // (a new conversation never inherits another thread's run).
        const destination =
          (id ? state.runsByThread[runKeyFor(id)] : undefined) ?? IDLE_RUN;
        return {
          activeRunId: destination.runId,
          activeRunStatus: destination.status,
          activeThreadId: id,
          isGenerating: destination.isGenerating,
          runStartedAt: destination.startedAt,
          runsByThread: {
            ...state.runsByThread,
            [runKeyFor(state.activeThreadId)]: recordOf(
              state,
              state.activeThreadId,
            ),
          },
          stream: { ...DEFAULT_STREAM_STATE },
        };
      }),
    setCreditsRemaining: (credits) => set({ creditsRemaining: credits }),
    setDraftAgentMode: (mode) => set({ draftAgentMode: mode }),
    setDraftRuntimeKey: (runtimeKey) => set({ draftRuntimeKey: runtimeKey }),
    setError: (error) =>
      set((state) => ({
        error,
        // Credit/limit failures should not leave the composer stuck on Stop.
        ...(error
          ? runTransitionPatch(state, state.activeThreadId, { type: 'error' })
          : {}),
      })),
    setIsGenerating: (generating) =>
      set((state) =>
        runTransitionPatch(state, state.activeThreadId, {
          isGenerating: generating,
          type: 'generating',
        }),
      ),
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
        onboardingTotalJourneyCredits:
          payload.totalJourneyCredits ?? ONBOARDING_JOURNEY_TOTAL_CREDITS,
        onboardingTotalVisibleCredits:
          payload.totalOnboardingCreditsVisible ??
          (payload.signupGiftCredits ?? 0) +
            (payload.totalJourneyCredits ?? ONBOARDING_JOURNEY_TOTAL_CREDITS),
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
    acceptThreadEventSequence: (threadId, sequence) => {
      if (typeof sequence !== 'number') {
        return true;
      }
      if (sequence <= (get().threadEventSequenceById[threadId] ?? 0)) {
        return false;
      }
      set((state) => ({
        threadEventSequenceById: {
          ...state.threadEventSequenceById,
          [threadId]: sequence,
        },
      }));
      return true;
    },
    applyThreadSnapshotState: (threadId, snapshot) =>
      set((state) => {
        const current = state.threadEventSequenceById[threadId] ?? 0;
        if (snapshot.lastSequence < current) {
          return state;
        }
        const known = state.uiActionRunsByThread[threadId] ?? {};
        const runs: Record<string, AgentThreadUiActionRun> = {};
        for (const run of snapshot.uiActionRuns ?? []) {
          const local = known[run.runId];
          // A run settled by its own terminal event after this snapshot was
          // read stays settled.
          runs[run.runId] =
            run.status === 'pending' &&
            local &&
            local.status !== 'pending' &&
            typeof local.terminalSequence === 'number'
              ? local
              : run;
        }
        // A run acknowledged (or settled) after this snapshot was read is not
        // in it yet; one it settled before was capped out of the projection.
        for (const local of Object.values(known)) {
          if (
            !runs[local.runId] &&
            (local.status === 'pending' ||
              typeof local.terminalSequence !== 'number' ||
              local.terminalSequence > snapshot.lastSequence)
          ) {
            runs[local.runId] = local;
          }
        }
        return {
          threadEventSequenceById: {
            ...state.threadEventSequenceById,
            [threadId]: snapshot.lastSequence,
          },
          ...withUiActionRuns(state, threadId, runs),
        };
      }),
    trackUiActionRun: (threadId, run) =>
      set((state) => {
        const runs = state.uiActionRunsByThread[threadId] ?? {};
        // A snapshot read while the request was in flight may already hold
        // the run, with its projected sequence (or even its outcome).
        if (runs[run.runId]) {
          return state;
        }
        // The ack does not carry its queued sequence; the run is newer than
        // every run the thread knows.
        const queuedSequence =
          Math.max(
            state.threadEventSequenceById[threadId] ?? 0,
            ...Object.values(runs).map((known) => known.queuedSequence),
          ) + 1;
        return withUiActionRuns(state, threadId, {
          ...runs,
          [run.runId]: {
            action: run.action,
            queuedSequence,
            runId: run.runId,
            sourceId: run.sourceId,
            status: 'pending',
            updatedAt: new Date().toISOString(),
          },
        });
      }),
    isUiActionSourceOwner: (threadId, result) =>
      isAgentUiActionSourceOwner(
        Object.values(get().uiActionRunsByThread[threadId] ?? {}),
        result,
      ),
    settleUiActionRun: (threadId, runId, outcome) =>
      set((state) => {
        const runs = state.uiActionRunsByThread[threadId];
        const pending = runs?.[runId];
        if (!runs || !pending || pending.status !== 'pending') {
          return state;
        }
        return withUiActionRuns(state, threadId, {
          ...runs,
          [runId]: {
            ...pending,
            ...(outcome.error ? { error: outcome.error } : {}),
            status: outcome.status,
            ...(typeof outcome.sequence === 'number'
              ? { terminalSequence: outcome.sequence }
              : {}),
            updatedAt: new Date().toISOString(),
          },
        });
      }),
    setWorkEvents: (events) => set({ workEvents: events }),
    socketConnectionState: 'connecting',
    stream: { ...DEFAULT_STREAM_STATE },
    threadPrompts: {},
    threads: [],
    threadEventSequenceById: {},
    threadUiBusyById: {},
    uiActionRunsByThread: {},
    uiActionStatesByThread: {},
    terminalSessionsByThread: options.ephemeral
      ? new Map()
      : loadPersistedSessionsByThread(),
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
    applyThreadStatusPush: (event, streamSequenceFloor = 0) => {
      const thread = get().threads.find((item) => item.id === event.threadId);
      if (!thread) {
        return 'unknown-thread';
      }
      if (
        event.sequence <=
        Math.max(thread.statusSequence ?? 0, streamSequenceFloor)
      ) {
        return 'stale';
      }
      const patch = resolveStatusPushPatch(event, thread);
      set((state) => ({
        threads: state.threads.map((item) =>
          item.id === event.threadId ? { ...item, ...patch } : item,
        ),
      }));
      return 'applied';
    },
    updateThread: (threadId, update) =>
      set((state) => ({
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  ...update,
                  updatedAt:
                    update.updatedAt ??
                    update.lastActivityAt ??
                    thread.updatedAt,
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

  return Object.assign(store, {
    disposeStreamTokens: discardPendingStreamTokens,
  });
}

export const useAgentChatStore = createAgentChatStore();

// The open thread's run reaches this store through actions, stream projection
// and snapshot hydration alike. Actions move `runsByThread` through
// `transitionRun`; stream projection still writes the compatibility fields
// directly, so first fold those back into the record. Then mirror the record's
// status into the thread summary at one choke point. The sidebar reads only the
// summary; without this a run that ends (or starts) on the open thread would
// leave its row stale. Skipped while the open thread itself changes: the switch
// resets the status to `idle`, which says nothing about the run (see
// `resolveRunSummaryPatch`).
useAgentChatStore.subscribe((next, previous) => {
  if (!next.activeThreadId || next.activeThreadId !== previous.activeThreadId) {
    return;
  }

  const record = selectActiveRun(next);
  if (
    record.runId !== next.activeRunId ||
    record.status !== next.activeRunStatus ||
    record.isGenerating !== next.isGenerating
  ) {
    useAgentChatStore.setState((state) => ({
      runsByThread: {
        ...state.runsByThread,
        [runKeyFor(state.activeThreadId)]: {
          isGenerating: state.isGenerating,
          runId: state.activeRunId,
          startedAt: state.runStartedAt,
          status: state.activeRunStatus,
        },
      },
    }));
    return;
  }

  if (record.status === selectActiveRun(previous).status) {
    return;
  }

  const activeThreadId = next.activeThreadId;
  const thread = next.threads.find((item) => item.id === activeThreadId);
  const patch = thread && resolveRunSummaryPatch(record.status, thread);
  if (!patch) {
    return;
  }

  useAgentChatStore.setState((state) => ({
    threads: state.threads.map((item) =>
      item.id === activeThreadId ? { ...item, ...patch } : item,
    ),
  }));
});
