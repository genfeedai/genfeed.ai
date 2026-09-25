import type {
  DesktopCliAgentToolCallStatus,
  IDesktopCliAgentMessageEvent,
  IDesktopCliAgentSessionEvent,
  IDesktopCliAgentTextDeltaEvent,
  IDesktopCliAgentToolCall,
  IDesktopCliAgentToolCallEvent,
  IDesktopCliAgentUsage,
  IDesktopCliAgentUsageEvent,
} from '@genfeedai/contracts/desktop';
import {
  type DesktopCliAgentProvider,
  GENFEED_MCP_SERVER_NAME,
} from './cli-agent-runtime.constants';

/** Terminal outcome parsed from the CLI stream. */
export interface CliAgentParsedResult {
  errorMessage?: string;
  isError: boolean;
  sessionId: string | null;
  text: string;
  usage?: IDesktopCliAgentUsage;
}

export interface CliAgentResultEvent {
  result: CliAgentParsedResult;
  type: 'result';
}

export type CliAgentParsedEvent =
  | CliAgentResultEvent
  | IDesktopCliAgentMessageEvent
  | IDesktopCliAgentSessionEvent
  | IDesktopCliAgentTextDeltaEvent
  | IDesktopCliAgentToolCallEvent
  | IDesktopCliAgentUsageEvent;

export interface CliAgentStreamParser {
  getLastError(): string | null;
  getSessionId(): string | null;
  getText(): string;
  getToolCalls(): IDesktopCliAgentToolCall[];
  parseLine(line: string): CliAgentParsedEvent[];
}

const MAX_ARGS_SUMMARY_LENGTH = 240;
const MAX_RESULT_SUMMARY_LENGTH = 400;
const SECRET_KEY_PATTERN =
  /(authorization|api[_-]?key|password|secret|token|cookie)/i;
const CLAUDE_MCP_TOOL_PREFIX = `mcp__${GENFEED_MCP_SERVER_NAME}__`;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(
  record: JsonRecord | null,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function truncate(value: string, maxLength: number): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength
    ? `${singleLine.slice(0, maxLength - 1)}…`
    : singleLine;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '…';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => redact(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redact(entry, depth + 1),
      ]),
    );
  }

  if (typeof value === 'string' && /\bgf_[A-Za-z0-9._-]+/.test(value)) {
    return value.replace(/\bgf_[A-Za-z0-9._-]+/g, '[redacted]');
  }

  return value;
}

/** Short, secret-free summary of tool arguments for the UI and the thread. */
export function summarizeToolArguments(input: unknown): string {
  if (input === undefined || input === null) {
    return '';
  }

  if (typeof input === 'string') {
    try {
      return summarizeToolArguments(JSON.parse(input) as unknown);
    } catch {
      return truncate(String(redact(input)), MAX_ARGS_SUMMARY_LENGTH);
    }
  }

  return truncate(JSON.stringify(redact(input)), MAX_ARGS_SUMMARY_LENGTH);
}

function summarizeToolResult(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content ? truncate(content, MAX_RESULT_SUMMARY_LENGTH) : undefined;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((block) =>
        isRecord(block) && typeof block.text === 'string' ? block.text : '',
      )
      .filter(Boolean)
      .join(' ');
    return text ? truncate(text, MAX_RESULT_SUMMARY_LENGTH) : undefined;
  }

  if (isRecord(content)) {
    if (Array.isArray(content.content)) {
      return summarizeToolResult(content.content);
    }
    return truncate(JSON.stringify(redact(content)), MAX_RESULT_SUMMARY_LENGTH);
  }

  return undefined;
}

function parseJsonLine(line: string): JsonRecord | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Shared bookkeeping for text and tool calls across both CLIs. */
class CliAgentTurnState {
  lastError: string | null = null;
  sessionId: string | null = null;
  text = '';
  private readonly toolCalls = new Map<string, IDesktopCliAgentToolCall>();
  private currentTextBlockKey: string | null = null;

  appendText(blockKey: string, text: string): IDesktopCliAgentTextDeltaEvent[] {
    if (!text) {
      return [];
    }

    const separator =
      this.text.length > 0 && this.currentTextBlockKey !== blockKey
        ? '\n\n'
        : '';
    this.currentTextBlockKey = blockKey;
    const delta = `${separator}${text}`;
    this.text += delta;
    return [{ text: delta, type: 'text-delta' }];
  }

  startToolCall(
    id: string,
    name: string,
    input: unknown,
  ): IDesktopCliAgentToolCallEvent[] {
    if (this.toolCalls.has(id)) {
      return [];
    }

    const toolCall: IDesktopCliAgentToolCall = {
      argsSummary: summarizeToolArguments(input),
      id,
      name,
      status: 'running',
    };
    this.toolCalls.set(id, toolCall);
    this.currentTextBlockKey = null;
    return [{ toolCall: { ...toolCall }, type: 'tool-call-started' }];
  }

  finishToolCall(
    id: string,
    status: Exclude<DesktopCliAgentToolCallStatus, 'running'>,
    details: { error?: string; name?: string; resultSummary?: string },
  ): IDesktopCliAgentToolCallEvent[] {
    const existing = this.toolCalls.get(id) ?? {
      argsSummary: '',
      id,
      name: details.name ?? 'tool',
      status: 'running' as const,
    };
    const finished: IDesktopCliAgentToolCall = {
      ...existing,
      ...(details.error ? { error: truncate(details.error, 400) } : {}),
      ...(details.resultSummary
        ? { resultSummary: details.resultSummary }
        : {}),
      status,
    };
    this.toolCalls.set(id, finished);
    return [{ toolCall: { ...finished }, type: 'tool-call-finished' }];
  }

  getToolCalls(): IDesktopCliAgentToolCall[] {
    return [...this.toolCalls.values()].map((toolCall) => ({ ...toolCall }));
  }
}

function displayToolName(rawName: string): string {
  return rawName.startsWith(CLAUDE_MCP_TOOL_PREFIX)
    ? rawName.slice(CLAUDE_MCP_TOOL_PREFIX.length)
    : rawName;
}

/**
 * Parses `claude -p --output-format stream-json --verbose
 * --include-partial-messages` output.
 */
export function createClaudeStreamParser(): CliAgentStreamParser {
  const state = new CliAgentTurnState();
  const streamedMessageIds = new Set<string>();
  let currentStreamMessageId: string | null = null;

  const handleStreamEvent = (event: JsonRecord): CliAgentParsedEvent[] => {
    const eventType = readString(event, 'type');

    if (eventType === 'message_start') {
      const message = isRecord(event.message) ? event.message : null;
      currentStreamMessageId = readString(message, 'id');
      return [];
    }

    if (eventType === 'content_block_delta') {
      const delta = isRecord(event.delta) ? event.delta : null;
      if (readString(delta, 'type') !== 'text_delta') {
        return [];
      }

      const messageId = currentStreamMessageId ?? 'stream';
      streamedMessageIds.add(messageId);
      return state.appendText(
        `${messageId}:${String(readNumber(event, 'index') ?? 0)}`,
        readString(delta, 'text') ?? '',
      );
    }

    return [];
  };

  const handleAssistant = (record: JsonRecord): CliAgentParsedEvent[] => {
    const message = isRecord(record.message) ? record.message : null;
    const messageId = readString(message, 'id') ?? 'assistant';
    const content = Array.isArray(message?.content) ? message.content : [];
    const events: CliAgentParsedEvent[] = [];

    content.forEach((block, index) => {
      if (!isRecord(block)) {
        return;
      }

      const blockType = readString(block, 'type');
      if (blockType === 'text') {
        const text = readString(block, 'text') ?? '';
        if (!streamedMessageIds.has(messageId)) {
          events.push(...state.appendText(`${messageId}:${index}`, text));
        }
        if (text) {
          events.push({ text, type: 'message' });
        }
        return;
      }

      if (blockType === 'tool_use') {
        const id = readString(block, 'id') ?? `${messageId}:${index}`;
        const name = displayToolName(readString(block, 'name') ?? 'tool');
        events.push(...state.startToolCall(id, name, block.input));
      }
    });

    return events;
  };

  const handleUser = (record: JsonRecord): CliAgentParsedEvent[] => {
    const message = isRecord(record.message) ? record.message : null;
    const content = Array.isArray(message?.content) ? message.content : [];
    const events: CliAgentParsedEvent[] = [];

    for (const block of content) {
      if (!isRecord(block) || readString(block, 'type') !== 'tool_result') {
        continue;
      }

      const id = readString(block, 'tool_use_id');
      if (!id) {
        continue;
      }

      const summary = summarizeToolResult(block.content);
      const isError = block.is_error === true;
      events.push(
        ...state.finishToolCall(id, isError ? 'failed' : 'completed', {
          ...(isError ? { error: summary ?? 'Tool call failed.' } : {}),
          ...(!isError && summary ? { resultSummary: summary } : {}),
        }),
      );
    }

    return events;
  };

  const handleResult = (record: JsonRecord): CliAgentParsedEvent[] => {
    const sessionId = readString(record, 'session_id') ?? state.sessionId;
    state.sessionId = sessionId;
    const usageRecord = isRecord(record.usage) ? record.usage : null;
    const usage: IDesktopCliAgentUsage = {
      ...(readNumber(usageRecord, 'cache_read_input_tokens') !== undefined
        ? {
            cachedInputTokens: readNumber(
              usageRecord,
              'cache_read_input_tokens',
            ),
          }
        : {}),
      ...(readNumber(record, 'total_cost_usd') !== undefined
        ? { costUsd: readNumber(record, 'total_cost_usd') }
        : {}),
      ...(readNumber(usageRecord, 'input_tokens') !== undefined
        ? { inputTokens: readNumber(usageRecord, 'input_tokens') }
        : {}),
      ...(readNumber(usageRecord, 'output_tokens') !== undefined
        ? { outputTokens: readNumber(usageRecord, 'output_tokens') }
        : {}),
    };
    const hasUsage = Object.keys(usage).length > 0;
    const isError =
      record.is_error === true ||
      (readString(record, 'subtype') ?? 'success') !== 'success';
    const resultText = readString(record, 'result') ?? '';
    const errors = Array.isArray(record.errors)
      ? record.errors.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [];
    const errorMessage = isError
      ? resultText ||
        errors.join('\n') ||
        readString(record, 'subtype') ||
        'Claude Code failed to complete the turn.'
      : undefined;

    if (errorMessage) {
      state.lastError = errorMessage;
    }

    return [
      ...(hasUsage ? [{ type: 'usage' as const, usage }] : []),
      {
        result: {
          ...(errorMessage ? { errorMessage } : {}),
          isError,
          sessionId,
          text: state.text || resultText,
          ...(hasUsage ? { usage } : {}),
        },
        type: 'result',
      },
    ];
  };

  return {
    getLastError: () => state.lastError,
    getSessionId: () => state.sessionId,
    getText: () => state.text,
    getToolCalls: () => state.getToolCalls(),
    parseLine(line: string): CliAgentParsedEvent[] {
      const record = parseJsonLine(line);
      if (!record) {
        return [];
      }

      switch (readString(record, 'type')) {
        case 'system': {
          if (readString(record, 'subtype') !== 'init') {
            return [];
          }
          const sessionId = readString(record, 'session_id');
          if (!sessionId) {
            return [];
          }
          state.sessionId = sessionId;
          const model = readString(record, 'model');
          return [{ ...(model ? { model } : {}), sessionId, type: 'session' }];
        }
        case 'stream_event':
          return isRecord(record.event) ? handleStreamEvent(record.event) : [];
        case 'assistant':
          return handleAssistant(record);
        case 'user':
          return handleUser(record);
        case 'result':
          return handleResult(record);
        default:
          return [];
      }
    },
  };
}

function readCodexUsage(record: JsonRecord | null): IDesktopCliAgentUsage {
  return {
    ...(readNumber(record, 'cached_input_tokens') !== undefined
      ? { cachedInputTokens: readNumber(record, 'cached_input_tokens') }
      : {}),
    ...(readNumber(record, 'input_tokens') !== undefined
      ? { inputTokens: readNumber(record, 'input_tokens') }
      : {}),
    ...(readNumber(record, 'output_tokens') !== undefined
      ? { outputTokens: readNumber(record, 'output_tokens') }
      : {}),
  };
}

function readCodexErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value) {
    return value;
  }
  return isRecord(value) ? readString(value, 'message') : null;
}

/**
 * Parses `codex exec --json` JSONL (`thread.started`, `item.*`,
 * `turn.completed` / `turn.failed`). The older `{ id, msg }` event envelope
 * is accepted too so older Codex installs keep working.
 */
export function createCodexStreamParser(): CliAgentStreamParser {
  const state = new CliAgentTurnState();
  let latestUsage: IDesktopCliAgentUsage | undefined;

  const handleItem = (
    phase: 'completed' | 'started' | 'updated',
    item: JsonRecord,
  ): CliAgentParsedEvent[] => {
    const id = readString(item, 'id') ?? `item-${String(Date.now())}`;
    const itemType = readString(item, 'type') ?? readString(item, 'item_type');

    if (itemType === 'agent_message' || itemType === 'assistant_message') {
      if (phase !== 'completed') {
        return [];
      }
      const text = readString(item, 'text') ?? '';
      return text
        ? [...state.appendText(id, text), { text, type: 'message' }]
        : [];
    }

    if (itemType === 'mcp_tool_call') {
      const server = readString(item, 'server');
      const tool = readString(item, 'tool') ?? 'tool';
      const name =
        server && server !== GENFEED_MCP_SERVER_NAME
          ? `${server}.${tool}`
          : tool;
      const status = readString(item, 'status');

      if (
        phase !== 'completed' &&
        status !== 'completed' &&
        status !== 'failed'
      ) {
        return state.startToolCall(id, name, item.arguments);
      }

      const started = state.startToolCall(id, name, item.arguments);
      const error = readCodexErrorMessage(item.error);
      const isFailed = status === 'failed' || Boolean(error);
      return [
        ...started,
        ...state.finishToolCall(id, isFailed ? 'failed' : 'completed', {
          ...(isFailed ? { error: error ?? 'Tool call failed.' } : {}),
          ...(!isFailed
            ? { resultSummary: summarizeToolResult(item.result) }
            : {}),
        }),
      ];
    }

    if (itemType === 'command_execution') {
      const started = state.startToolCall(id, 'shell', {
        command: readString(item, 'command') ?? '',
      });
      if (phase !== 'completed') {
        return started;
      }
      const exitCode = readNumber(item, 'exit_code');
      const isFailed =
        readString(item, 'status') === 'failed' ||
        (exitCode !== undefined && exitCode !== 0);
      const output = summarizeToolResult(readString(item, 'aggregated_output'));
      return [
        ...started,
        ...state.finishToolCall(id, isFailed ? 'failed' : 'completed', {
          ...(isFailed
            ? { error: output ?? `Command exited with ${String(exitCode)}` }
            : { resultSummary: output }),
        }),
      ];
    }

    if (itemType === 'web_search') {
      const started = state.startToolCall(id, 'web_search', {
        query: readString(item, 'query') ?? '',
      });
      return phase === 'completed'
        ? [...started, ...state.finishToolCall(id, 'completed', {})]
        : started;
    }

    if (itemType === 'error' && phase === 'completed') {
      state.lastError = readString(item, 'message') ?? state.lastError;
    }

    return [];
  };

  const completeTurn = (
    isError: boolean,
    errorMessage?: string,
  ): CliAgentParsedEvent[] => [
    ...(latestUsage && !isError
      ? [{ type: 'usage' as const, usage: latestUsage }]
      : []),
    {
      result: {
        ...(errorMessage ? { errorMessage } : {}),
        isError,
        sessionId: state.sessionId,
        text: state.text,
        ...(latestUsage ? { usage: latestUsage } : {}),
      },
      type: 'result',
    },
  ];

  /** Legacy `{ id, msg: { type, ... } }` envelope from older Codex builds. */
  const handleLegacyMessage = (message: JsonRecord): CliAgentParsedEvent[] => {
    switch (readString(message, 'type')) {
      case 'session_configured': {
        const sessionId = readString(message, 'session_id');
        if (!sessionId) {
          return [];
        }
        state.sessionId = sessionId;
        const model = readString(message, 'model');
        return [{ ...(model ? { model } : {}), sessionId, type: 'session' }];
      }
      case 'agent_message': {
        const text = readString(message, 'message') ?? '';
        return text
          ? [
              ...state.appendText(`legacy-${String(state.text.length)}`, text),
              { text, type: 'message' },
            ]
          : [];
      }
      case 'mcp_tool_call_begin': {
        const invocation = isRecord(message.invocation)
          ? message.invocation
          : null;
        return state.startToolCall(
          readString(message, 'call_id') ?? 'mcp',
          readString(invocation, 'tool') ?? 'tool',
          invocation?.arguments,
        );
      }
      case 'mcp_tool_call_end': {
        const result = isRecord(message.result) ? message.result : null;
        const error = readCodexErrorMessage(result?.Err);
        return state.finishToolCall(
          readString(message, 'call_id') ?? 'mcp',
          error ? 'failed' : 'completed',
          error
            ? { error }
            : { resultSummary: summarizeToolResult(result?.Ok) },
        );
      }
      case 'token_count': {
        const info = isRecord(message.info) ? message.info : null;
        const total = isRecord(info?.total_token_usage)
          ? info.total_token_usage
          : message;
        latestUsage = readCodexUsage(total);
        return [];
      }
      case 'task_complete':
        return completeTurn(false);
      case 'error': {
        const errorMessage =
          readString(message, 'message') ??
          'Codex failed to complete the turn.';
        state.lastError = errorMessage;
        return completeTurn(true, errorMessage);
      }
      default:
        return [];
    }
  };

  return {
    getLastError: () => state.lastError,
    getSessionId: () => state.sessionId,
    getText: () => state.text,
    getToolCalls: () => state.getToolCalls(),
    parseLine(line: string): CliAgentParsedEvent[] {
      const record = parseJsonLine(line);
      if (!record) {
        return [];
      }

      if (isRecord(record.msg)) {
        return handleLegacyMessage(record.msg);
      }

      const eventType = readString(record, 'type');
      switch (eventType) {
        case 'thread.started':
        case 'session.created': {
          const sessionId =
            readString(record, 'thread_id') ?? readString(record, 'session_id');
          if (!sessionId) {
            return [];
          }
          state.sessionId = sessionId;
          return [{ sessionId, type: 'session' }];
        }
        case 'item.started':
        case 'item.updated':
        case 'item.completed':
          return isRecord(record.item)
            ? handleItem(
                eventType.slice('item.'.length) as
                  | 'completed'
                  | 'started'
                  | 'updated',
                record.item,
              )
            : [];
        case 'turn.completed':
          latestUsage = readCodexUsage(
            isRecord(record.usage) ? record.usage : null,
          );
          return completeTurn(false);
        case 'turn.failed': {
          const errorMessage =
            readCodexErrorMessage(record.error) ??
            state.lastError ??
            'Codex failed to complete the turn.';
          state.lastError = errorMessage;
          return completeTurn(true, errorMessage);
        }
        case 'error':
          // Codex reports transient retries here; the turn outcome follows.
          state.lastError = readString(record, 'message') ?? state.lastError;
          return [];
        default:
          return [];
      }
    },
  };
}

export function createCliAgentStreamParser(
  provider: DesktopCliAgentProvider,
): CliAgentStreamParser {
  return provider === 'claude'
    ? createClaudeStreamParser()
    : createCodexStreamParser();
}
