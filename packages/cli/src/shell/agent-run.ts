import {
  type AgentChatRequest,
  type AgentPendingInputRequest,
  type AgentThreadEvent,
  getThread,
  getThreadEvents,
  getThreadSnapshot,
  respondToInputRequest,
  startAgentChatStream,
} from '@/api/threads';
import {
  type AgentLiveStream,
  type AgentLiveStreamEvent,
  openAgentLiveStream,
} from '@/shell/agent-live-stream';
import { extractString, isRecord } from '@/utils/extract';

const EVENT_POLL_INTERVAL_MS = 250;

type AgentRunStatus = 'completed' | 'failed' | 'timeout' | 'waiting-input';

export interface AgentRunStart {
  brandId?: string | null;
  contextVersion?: number;
  runId?: string;
  startedAt?: string;
  threadId: string;
}

export interface AgentRunCallbacks {
  onAssistantDelta?: (token: string, content: string) => void;
  onAssistantFinalized?: (
    content: string,
    previousContent: string,
    metadata?: Record<string, unknown>
  ) => void;
  onPersistedEvent?: (event: AgentThreadEvent) => Promise<void> | void;
  onRunStarted?: (run: AgentRunStart) => Promise<void> | void;
  onTransportError?: (error: Error) => void;
}

export interface AgentRunResult extends AgentRunStart {
  assistantMessage?: string;
  error?: string;
  lastSequence: number;
  pendingInputRequest?: AgentPendingInputRequest;
  status: AgentRunStatus;
  uiActions?: Array<Record<string, unknown>>;
}

interface RunAccumulator {
  finalized: boolean;
  finalizedContent?: string;
  liveContent: string;
  result?: Omit<AgentRunResult, keyof AgentRunStart | 'lastSequence' | 'uiActions'>;
  uiActions?: Array<Record<string, unknown>>;
}

function extractUiActions(
  metadata?: Record<string, unknown>
): Array<Record<string, unknown>> | undefined {
  const uiActions = metadata?.uiActions;
  if (!Array.isArray(uiActions)) {
    return undefined;
  }

  return uiActions.filter(isRecord);
}

function toPendingInputRequest(payload: Record<string, unknown>): AgentPendingInputRequest {
  return {
    allowFreeText: typeof payload.allowFreeText === 'boolean' ? payload.allowFreeText : undefined,
    fieldId: extractString(payload, 'fieldId'),
    metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
    options: Array.isArray(payload.options)
      ? (payload.options as AgentPendingInputRequest['options'])
      : undefined,
    prompt: extractString(payload, 'prompt') ?? 'Provide the requested input.',
    recommendedOptionId: extractString(payload, 'recommendedOptionId'),
    requestId: extractString(payload, 'requestId') ?? '',
    title: extractString(payload, 'title') ?? 'Input requested',
  };
}

function currentAssistantMessage(accumulator: RunAccumulator): string {
  return accumulator.finalizedContent ?? accumulator.liveContent;
}

function finalizeAssistantMessage(
  accumulator: RunAccumulator,
  content: string,
  callbacks: AgentRunCallbacks,
  metadata?: Record<string, unknown>
): void {
  if (accumulator.finalized) {
    return;
  }

  const previousContent = currentAssistantMessage(accumulator);
  accumulator.finalized = true;
  accumulator.finalizedContent = content;
  accumulator.uiActions = extractUiActions(metadata);
  callbacks.onAssistantFinalized?.(content, previousContent, metadata);
}

function handleLiveEvent(
  event: AgentLiveStreamEvent,
  accumulator: RunAccumulator,
  callbacks: AgentRunCallbacks
): void {
  switch (event.type) {
    case 'token': {
      if (accumulator.finalized) {
        return;
      }
      accumulator.liveContent += event.payload.token;
      callbacks.onAssistantDelta?.(event.payload.token, accumulator.liveContent);
      return;
    }
    case 'done': {
      finalizeAssistantMessage(
        accumulator,
        event.payload.fullContent,
        callbacks,
        event.payload.metadata
      );
      accumulator.result = { status: 'completed' };
      return;
    }
    case 'error': {
      accumulator.result = {
        error: event.payload.error || 'Agent run failed',
        status: 'failed',
      };
      return;
    }
    case 'disconnected': {
      callbacks.onTransportError?.(
        new Error(`Live stream disconnected: ${event.reason}; recovering from persisted events`)
      );
      return;
    }
    case 'transport-error': {
      callbacks.onTransportError?.(event.error);
      return;
    }
    case 'reconnected':
      return;
  }
}

function handlePersistedEvent(
  event: AgentThreadEvent,
  accumulator: RunAccumulator,
  callbacks: AgentRunCallbacks
): void {
  const payload = event.payload ?? {};

  // `assistant.delta` rows are no longer persisted (#2793) and every call site
  // reads events from the thread's current tail, so persisted deltas can never
  // reach this switch — streaming tokens arrive via the live transport only.
  switch (event.type) {
    case 'assistant.finalized': {
      const content = extractString(payload, 'content') ?? currentAssistantMessage(accumulator);
      const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
      finalizeAssistantMessage(accumulator, content, callbacks, metadata);
      return;
    }
    case 'input.requested': {
      accumulator.result = {
        pendingInputRequest: toPendingInputRequest(payload),
        status: 'waiting-input',
      };
      return;
    }
    case 'run.completed': {
      accumulator.result = { status: 'completed' };
      return;
    }
    case 'error.raised':
    case 'run.failed': {
      accumulator.result = {
        error: extractString(payload, 'error') ?? 'Agent run failed',
        status: 'failed',
      };
      return;
    }
    default:
      return;
  }
}

function buildResult(
  accumulator: RunAccumulator,
  run: AgentRunStart,
  lastSequence: number
): AgentRunResult | undefined {
  if (!accumulator.result) {
    return undefined;
  }

  const assistantMessage = currentAssistantMessage(accumulator);
  return {
    ...run,
    ...accumulator.result,
    assistantMessage: assistantMessage || accumulator.result.assistantMessage,
    lastSequence,
    uiActions: accumulator.uiActions,
  };
}

async function consumePersistedEvents(
  events: AgentThreadEvent[],
  run: AgentRunStart,
  lastSequence: number,
  accumulator: RunAccumulator,
  callbacks: AgentRunCallbacks
): Promise<number> {
  let nextSequence = lastSequence;

  for (const event of events) {
    nextSequence = Math.max(nextSequence, event.sequence);

    if (run.runId && event.runId && event.runId !== run.runId) {
      continue;
    }

    await callbacks.onPersistedEvent?.(event);
    handlePersistedEvent(event, accumulator, callbacks);
  }

  return nextSequence;
}

async function collectRunResult(
  run: AgentRunStart,
  afterSequence: number,
  timeoutMs: number,
  callbacks: AgentRunCallbacks,
  liveStream?: AgentLiveStream
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  let lastSequence = afterSequence;
  const accumulator: RunAccumulator = {
    finalized: false,
    liveContent: '',
  };

  while (Date.now() - startedAt < timeoutMs) {
    for (const event of liveStream?.drain() ?? []) {
      handleLiveEvent(event, accumulator, callbacks);
    }

    const liveResult = buildResult(accumulator, run, lastSequence);
    if (liveResult) {
      // The publisher persists assistant.finalized/run.completed before it
      // emits agent:done. Read that durable tail once so the next shell turn
      // starts after this run instead of re-consuming its terminal events.
      const terminalEvents = await getThreadEvents(run.threadId, lastSequence);
      lastSequence = await consumePersistedEvents(
        terminalEvents,
        run,
        lastSequence,
        accumulator,
        callbacks
      );
      return buildResult(accumulator, run, lastSequence) ?? liveResult;
    }

    const events = await getThreadEvents(run.threadId, lastSequence);
    lastSequence = await consumePersistedEvents(events, run, lastSequence, accumulator, callbacks);

    const persistedResult = buildResult(accumulator, run, lastSequence);
    if (persistedResult) {
      return persistedResult;
    }

    if (liveStream) {
      await liveStream.waitForActivity(EVENT_POLL_INTERVAL_MS);
    } else {
      await new Promise((resolve) => setTimeout(resolve, EVENT_POLL_INTERVAL_MS));
    }
  }

  const assistantMessage = currentAssistantMessage(accumulator);
  return {
    ...run,
    assistantMessage: assistantMessage || undefined,
    error: `Timed out waiting for agent run after ${timeoutMs}ms`,
    lastSequence,
    status: 'timeout',
    uiActions: accumulator.uiActions,
  };
}

export async function observeAgentRun(
  startRun: () => Promise<AgentRunStart>,
  afterSequence: number | ((run: AgentRunStart) => number),
  timeoutMs = 120_000,
  callbacks: AgentRunCallbacks = {}
): Promise<AgentRunResult> {
  let liveStream: AgentLiveStream | undefined;

  try {
    try {
      liveStream = await openAgentLiveStream();
      await liveStream.waitUntilReady();
    } catch (error) {
      callbacks.onTransportError?.(
        error instanceof Error ? error : new Error(`Live stream unavailable: ${String(error)}`)
      );
    }

    const run = await startRun();
    const initialSequence =
      typeof afterSequence === 'function' ? afterSequence(run) : afterSequence;
    liveStream?.bind({ runId: run.runId, threadId: run.threadId });
    await callbacks.onRunStarted?.(run);

    return await collectRunResult(run, initialSequence, timeoutMs, callbacks, liveStream);
  } finally {
    liveStream?.close();
  }
}

export async function runAgentTurn(
  request: AgentChatRequest,
  timeoutMs = 120_000,
  callbacks: AgentRunCallbacks = {}
): Promise<AgentRunResult> {
  const [thread, snapshot] = request.threadId
    ? await Promise.all([getThread(request.threadId), getThreadSnapshot(request.threadId)])
    : [undefined, undefined];
  const initialSequence = snapshot?.lastSequence ?? 0;

  return await observeAgentRun(
    async () =>
      await startAgentChatStream({
        ...request,
        brandId: thread?.brandId ?? null,
        expectedContextVersion: thread?.contextVersion,
      }),
    initialSequence,
    timeoutMs,
    callbacks
  );
}

export async function answerPendingInput(
  threadId: string,
  answer: string,
  requestId?: string,
  timeoutMs = 120_000,
  callbacks: AgentRunCallbacks = {}
): Promise<AgentRunResult> {
  const [thread, snapshot] = await Promise.all([getThread(threadId), getThreadSnapshot(threadId)]);
  const pendingInputRequest =
    snapshot.pendingInputRequests.find((request) => request.requestId === requestId) ??
    snapshot.pendingInputRequests.at(-1);

  if (!pendingInputRequest) {
    throw new Error(`Thread ${threadId} has no pending input requests.`);
  }

  return await observeAgentRun(
    async () => {
      await respondToInputRequest(threadId, pendingInputRequest.requestId, answer, {
        brandId: thread.brandId ?? null,
        expectedContextVersion: thread.contextVersion,
      });
      return { threadId };
    },
    snapshot.lastSequence ?? 0,
    timeoutMs,
    callbacks
  );
}
