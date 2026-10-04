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

/** The run state of the chat store, as `runTransitionPatch` reads it. */
export interface RunStateSlice {
  activeThreadId: string | null;
  runsByThread: Record<string, AgentRunRecord>;
  threads: AgentThread[];
}

type RunRecords = Record<string, AgentRunRecord>;

export function runKeyFor(threadId: string | null): string {
  return threadId ?? DRAFT_RUN_KEY;
}

export function recordOf(state: RunStateSlice, threadId: string | null) {
  return state.runsByThread[runKeyFor(threadId)] ?? IDLE_RUN;
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
 * The one place run state changes: moves `threadId`'s record in
 * `runsByThread`. A background thread's transition never touches the visible
 * thread's record.
 */
export function runTransitionPatch(
  state: RunStateSlice,
  threadId: string | null,
  event: AgentRunEvent,
): { runsByThread: RunRecords } & Partial<Pick<RunStateSlice, 'threads'>> {
  const key = runKeyFor(threadId);
  const previous = recordOf(state, threadId);
  const next = applyRunEvent(previous, event);
  const runsByThread = { ...state.runsByThread, [key]: next };

  // The sidebar reads only the thread summary, so the transitioned thread's
  // row moves in the same update, visible or not.
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

  return threads ? { runsByThread, threads } : { runsByThread };
}

/**
 * The draft (`__new__`) record moves to the thread it became, so a run begun
 * before the thread existed stays readable under its real id.
 */
export function adoptDraftRunPatch(
  state: { runsByThread: RunRecords },
  threadId: string,
): { runsByThread: RunRecords } {
  const { [DRAFT_RUN_KEY]: draftRun, ...otherRuns } = state.runsByThread;
  return {
    runsByThread: draftRun
      ? { ...otherRuns, [threadId]: draftRun }
      : state.runsByThread,
  };
}

/** The visible thread's run record. */
export function selectActiveRun(state: RunStateSlice): AgentRunRecord {
  return recordOf(state, state.activeThreadId);
}

export function selectIsGenerating(state: RunStateSlice): boolean {
  return selectActiveRun(state).isGenerating;
}
