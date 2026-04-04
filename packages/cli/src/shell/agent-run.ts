import {
  type AgentChatRequest,
  type AgentPendingInputRequest,
  type AgentThreadEvent,
  getThreadEvents,
  getThreadSnapshot,
  respondToInputRequest,
  startAgentChatStream,
} from '@/api/threads.js';

type AgentRunStatus = 'completed' | 'failed' | 'timeout' | 'waiting-input';

export interface AgentRunResult {
  assistantMessage?: string;
  error?: string;
  lastSequence: number;
  pendingInputRequest?: AgentPendingInputRequest;
  runId?: string;
  startedAt?: string;
  status: AgentRunStatus;
  threadId: string;
  uiActions?: Array<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractString(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
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

async function collectRunResult(
  threadId: string,
  afterSequence: number,
  timeoutMs: number
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  let lastSequence = afterSequence;
  let assistantMessage = '';
  let uiActions: Array<Record<string, unknown>> | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const events = await getThreadEvents(threadId, lastSequence);

    if (events.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    for (const event of events) {
      lastSequence = Math.max(lastSequence, event.sequence);

      const outcome = handleThreadEvent(event, assistantMessage);
      if (outcome.appendAssistantMessage) {
        assistantMessage += outcome.appendAssistantMessage;
      }
      if (outcome.replaceAssistantMessage !== undefined) {
        assistantMessage = outcome.replaceAssistantMessage;
      }
      if (outcome.uiActions) {
        uiActions = outcome.uiActions;
      }
      if (outcome.result) {
        return {
          ...outcome.result,
          assistantMessage: assistantMessage || outcome.result.assistantMessage,
          lastSequence,
          threadId,
          uiActions,
        };
      }
    }
  }

  return {
    assistantMessage: assistantMessage || undefined,
    error: `Timed out waiting for agent run after ${timeoutMs}ms`,
    lastSequence,
    status: 'timeout',
    threadId,
    uiActions,
  };
}

function handleThreadEvent(
  event: AgentThreadEvent,
  assistantMessage: string
): {
  appendAssistantMessage?: string;
  replaceAssistantMessage?: string;
  result?: Omit<AgentRunResult, 'lastSequence' | 'threadId' | 'uiActions'>;
  uiActions?: Array<Record<string, unknown>>;
} {
  const payload = event.payload ?? {};

  switch (event.type) {
    case 'assistant.delta': {
      const token = extractString(payload, 'content');
      return token ? { appendAssistantMessage: token } : {};
    }
    case 'assistant.finalized': {
      const content = extractString(payload, 'content');
      return {
        replaceAssistantMessage: content ?? assistantMessage,
        uiActions: extractUiActions(isRecord(payload.metadata) ? payload.metadata : undefined),
      };
    }
    case 'input.requested': {
      return {
        result: {
          assistantMessage: assistantMessage || undefined,
          pendingInputRequest: toPendingInputRequest(payload),
          status: 'waiting-input',
        },
      };
    }
    case 'run.completed': {
      return {
        result: {
          assistantMessage: assistantMessage || undefined,
          status: 'completed',
        },
      };
    }
    case 'error.raised':
    case 'run.failed': {
      return {
        result: {
          assistantMessage: assistantMessage || undefined,
          error: extractString(payload, 'error') ?? 'Agent run failed',
          status: 'failed',
        },
      };
    }
    default:
      return {};
  }
}

export async function runAgentTurn(
  request: AgentChatRequest,
  timeoutMs = 120_000
): Promise<AgentRunResult> {
  const initialSequence = request.threadId
    ? ((await getThreadSnapshot(request.threadId)).lastSequence ?? 0)
    : 0;

  const run = await startAgentChatStream(request);
  const result = await collectRunResult(run.threadId, initialSequence, timeoutMs);

  return {
    ...result,
    runId: run.runId,
    startedAt: run.startedAt,
  };
}

export async function answerPendingInput(
  threadId: string,
  answer: string,
  requestId?: string,
  timeoutMs = 120_000
): Promise<AgentRunResult> {
  const snapshot = await getThreadSnapshot(threadId);
  const pendingInputRequest =
    snapshot.pendingInputRequests.find((request) => request.requestId === requestId) ??
    snapshot.pendingInputRequests.at(-1);

  if (!pendingInputRequest) {
    throw new Error(`Thread ${threadId} has no pending input requests.`);
  }

  await respondToInputRequest(threadId, pendingInputRequest.requestId, answer);
  return await collectRunResult(threadId, snapshot.lastSequence ?? 0, timeoutMs);
}
