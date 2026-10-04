import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { resolveRunSummaryPatch } from '@genfeedai/agent/utils/agent-thread-run-summary.util';

// Pure run-state model for the chat store. Kept apart from the store module so
// the stream runtime and hooks import it without pulling the store (specs mock
// the store module wholesale).

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

export const IDLE_RUN: AgentRunRecord = {
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
  /** The run's start time was set without moving its id or status. */
  | { type: 'started-at'; startedAt: string | null }
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

/** The run fields of the chat store, as `runTransitionPatch` reads them. */
export interface RunStateSlice {
  activeRunId: string | null;
  activeRunStatus: AgentRunStatus;
  activeThreadId: string | null;
  isGenerating: boolean;
  runStartedAt: string | null;
  runsByThread: Record<string, AgentRunRecord>;
  threads: AgentThread[];
}

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
    case 'started-at':
      return { ...record, startedAt: event.startedAt };
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
): Pick<RunStateSlice, 'runsByThread'> &
  Partial<
    Pick<
      RunStateSlice,
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
      event.type === 'started-at' ||
      event.type === 'complete' ||
      event.type === 'reset'
        ? next.startedAt
        : state.runStartedAt,
    runsByThread,
  };
}

/**
 * The draft (`__new__`) record moves to the thread it became, so a run begun
 * before the thread existed stays readable under its real id.
 */
export function adoptDraftRunPatch(
  state: Pick<RunStateSlice, 'runsByThread'>,
  threadId: string,
): Pick<RunStateSlice, 'runsByThread'> {
  const { [DRAFT_RUN_KEY]: draftRun, ...otherRuns } = state.runsByThread;
  return {
    runsByThread: draftRun
      ? { ...otherRuns, [threadId]: draftRun }
      : state.runsByThread,
  };
}

/** The visible thread's run record. */
export function selectActiveRun(state: RunStateSlice): AgentRunRecord {
  return state.runsByThread[runKeyFor(state.activeThreadId)] ?? IDLE_RUN;
}

export function selectIsGenerating(state: RunStateSlice): boolean {
  return selectActiveRun(state).isGenerating;
}
