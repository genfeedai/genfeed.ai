import { describe, expect, it } from 'bun:test';
import {
  type CliAgentParsedEvent,
  createClaudeStreamParser,
  createCodexStreamParser,
  summarizeToolArguments,
} from './cli-agent-stream-parser';

const CLAUDE_SESSION_ID = '6f1c1d1e-7a4b-4c1b-9a8a-0d8a2c1f5e11';

/** `claude -p --output-format stream-json --verbose --include-partial-messages` */
const CLAUDE_FIXTURE = [
  {
    type: 'system',
    subtype: 'init',
    session_id: CLAUDE_SESSION_ID,
    model: 'claude-sonnet-4-5',
    tools: ['mcp__genfeed__get_brand_context'],
    mcp_servers: [{ name: 'genfeed', status: 'connected' }],
  },
  {
    type: 'stream_event',
    session_id: CLAUDE_SESSION_ID,
    event: { type: 'message_start', message: { id: 'msg_1' } },
  },
  {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Loading your ' },
    },
  },
  {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'brand.' },
    },
  },
  {
    type: 'assistant',
    session_id: CLAUDE_SESSION_ID,
    message: {
      id: 'msg_1',
      content: [
        { type: 'text', text: 'Loading your brand.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'mcp__genfeed__get_brand_context',
          input: { apiKey: 'gf_live_secret', brandId: 'brand-1' },
        },
      ],
    },
  },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: [{ type: 'text', text: 'Voice: playful, concise.' }],
        },
      ],
    },
  },
  {
    type: 'assistant',
    session_id: CLAUDE_SESSION_ID,
    message: {
      id: 'msg_2',
      content: [{ type: 'text', text: 'Here is your post.' }],
    },
  },
  {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Here is your post.',
    session_id: CLAUDE_SESSION_ID,
    total_cost_usd: 0.0123,
    usage: {
      cache_read_input_tokens: 800,
      input_tokens: 1500,
      output_tokens: 220,
    },
  },
].map((event) => JSON.stringify(event));

function parseAll(
  parser: { parseLine(line: string): CliAgentParsedEvent[] },
  lines: string[],
): CliAgentParsedEvent[] {
  return lines.flatMap((line) => parser.parseLine(line));
}

describe('createClaudeStreamParser', () => {
  it('normalizes a full Claude Code turn', () => {
    const parser = createClaudeStreamParser();
    const events = parseAll(parser, CLAUDE_FIXTURE);

    expect(events[0]).toEqual({
      model: 'claude-sonnet-4-5',
      sessionId: CLAUDE_SESSION_ID,
      type: 'session',
    });
    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => (event.type === 'text-delta' ? event.text : '')),
    ).toEqual(['Loading your ', 'brand.', '\n\nHere is your post.']);

    const started = events.find((event) => event.type === 'tool-call-started');
    expect(started).toEqual({
      toolCall: {
        argsSummary: '{"apiKey":"[redacted]","brandId":"brand-1"}',
        id: 'toolu_1',
        name: 'get_brand_context',
        status: 'running',
      },
      type: 'tool-call-started',
    });
    expect(
      events.find((event) => event.type === 'tool-call-finished'),
    ).toMatchObject({
      toolCall: {
        name: 'get_brand_context',
        resultSummary: 'Voice: playful, concise.',
        status: 'completed',
      },
    });

    const result = events.at(-1);
    expect(result).toEqual({
      result: {
        isError: false,
        sessionId: CLAUDE_SESSION_ID,
        text: 'Loading your brand.\n\nHere is your post.',
        usage: {
          cachedInputTokens: 800,
          costUsd: 0.0123,
          inputTokens: 1500,
          outputTokens: 220,
        },
      },
      type: 'result',
    });
    expect(parser.getToolCalls()).toHaveLength(1);
  });

  it('uses assistant text when partial messages are not streamed', () => {
    const parser = createClaudeStreamParser();
    const events = parseAll(parser, [
      JSON.stringify({
        type: 'assistant',
        message: { id: 'msg_1', content: [{ type: 'text', text: 'Hi' }] },
      }),
    ]);

    expect(events).toEqual([
      { text: 'Hi', type: 'text-delta' },
      { text: 'Hi', type: 'message' },
    ]);
  });

  it('reports failed tool results and error results', () => {
    const parser = createClaudeStreamParser();
    const events = parseAll(parser, [
      JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_1',
          content: [
            { type: 'tool_use', id: 't1', name: 'mcp__genfeed__x', input: {} },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'Forbidden',
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Invalid API key · Please run /login',
        session_id: CLAUDE_SESSION_ID,
      }),
    ]);

    expect(
      events.find((event) => event.type === 'tool-call-finished'),
    ).toMatchObject({ toolCall: { error: 'Forbidden', status: 'failed' } });
    expect(events.at(-1)).toMatchObject({
      result: {
        errorMessage: 'Invalid API key · Please run /login',
        isError: true,
      },
    });
  });

  it('ignores non-JSON noise', () => {
    const parser = createClaudeStreamParser();
    expect(parser.parseLine('warning: something')).toEqual([]);
    expect(parser.parseLine('')).toEqual([]);
    expect(parser.parseLine('{not json')).toEqual([]);
  });
});

const CODEX_THREAD_ID = '0199a213-81c0-7800-8aa1-bbab2a035a53';

/** `codex exec --json` */
const CODEX_FIXTURE = [
  { type: 'thread.started', thread_id: CODEX_THREAD_ID },
  { type: 'turn.started' },
  {
    type: 'item.completed',
    item: { id: 'item_0', type: 'reasoning', text: 'Thinking' },
  },
  {
    type: 'item.started',
    item: {
      id: 'item_1',
      type: 'mcp_tool_call',
      server: 'genfeed',
      tool: 'get_brand_context',
      arguments: { brandId: 'brand-1' },
      status: 'in_progress',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'item_1',
      type: 'mcp_tool_call',
      server: 'genfeed',
      tool: 'get_brand_context',
      arguments: { brandId: 'brand-1' },
      result: { content: [{ type: 'text', text: 'Voice: bold' }] },
      status: 'completed',
    },
  },
  {
    type: 'item.completed',
    item: { id: 'item_2', type: 'agent_message', text: 'Draft ready.' },
  },
  {
    type: 'turn.completed',
    usage: { cached_input_tokens: 10, input_tokens: 900, output_tokens: 80 },
  },
].map((event) => JSON.stringify(event));

describe('createCodexStreamParser', () => {
  it('normalizes a full Codex exec turn', () => {
    const parser = createCodexStreamParser();
    const events = parseAll(parser, CODEX_FIXTURE);

    expect(events[0]).toEqual({ sessionId: CODEX_THREAD_ID, type: 'session' });
    expect(events.map((event) => event.type)).toEqual([
      'session',
      'tool-call-started',
      'tool-call-finished',
      'text-delta',
      'message',
      'usage',
      'result',
    ]);
    expect(events[2]).toMatchObject({
      toolCall: {
        argsSummary: '{"brandId":"brand-1"}',
        name: 'get_brand_context',
        resultSummary: 'Voice: bold',
        status: 'completed',
      },
    });
    expect(events.at(-1)).toEqual({
      result: {
        isError: false,
        sessionId: CODEX_THREAD_ID,
        text: 'Draft ready.',
        usage: { cachedInputTokens: 10, inputTokens: 900, outputTokens: 80 },
      },
      type: 'result',
    });
  });

  it('reports failed turns with the Codex error message', () => {
    const parser = createCodexStreamParser();
    const events = parseAll(parser, [
      JSON.stringify({ type: 'thread.started', thread_id: CODEX_THREAD_ID }),
      JSON.stringify({ type: 'error', message: 'Reconnecting... 1/5' }),
      JSON.stringify({
        type: 'turn.failed',
        error: { message: 'You are not logged in. Run codex login.' },
      }),
    ]);

    expect(events.at(-1)).toMatchObject({
      result: {
        errorMessage: 'You are not logged in. Run codex login.',
        isError: true,
        sessionId: CODEX_THREAD_ID,
      },
    });
  });

  it('marks failed MCP calls', () => {
    const parser = createCodexStreamParser();
    const events = parseAll(parser, [
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'mcp_tool_call',
          server: 'genfeed',
          tool: 'publish_post',
          arguments: '{"postId":"p1"}',
          error: { message: 'Insufficient credits' },
          status: 'failed',
        },
      }),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      'tool-call-started',
      'tool-call-finished',
    ]);
    expect(events[1]).toMatchObject({
      toolCall: {
        argsSummary: '{"postId":"p1"}',
        error: 'Insufficient credits',
        status: 'failed',
      },
    });
  });

  it('accepts the legacy { id, msg } envelope', () => {
    const parser = createCodexStreamParser();
    const events = parseAll(parser, [
      JSON.stringify({
        id: '0',
        msg: { type: 'session_configured', session_id: 'legacy-1' },
      }),
      JSON.stringify({
        id: '1',
        msg: {
          type: 'mcp_tool_call_begin',
          call_id: 'c1',
          invocation: { server: 'genfeed', tool: 'get_brand_context' },
        },
      }),
      JSON.stringify({
        id: '1',
        msg: {
          type: 'mcp_tool_call_end',
          call_id: 'c1',
          result: { Ok: { content: [{ type: 'text', text: 'ok' }] } },
        },
      }),
      JSON.stringify({
        id: '1',
        msg: { type: 'agent_message', message: 'Hi' },
      }),
      JSON.stringify({ id: '1', msg: { type: 'task_complete' } }),
    ]);

    expect(events.at(-1)).toEqual({
      result: { isError: false, sessionId: 'legacy-1', text: 'Hi' },
      type: 'result',
    });
    expect(parser.getToolCalls()[0]).toMatchObject({
      name: 'get_brand_context',
      status: 'completed',
    });
  });
});

describe('summarizeToolArguments', () => {
  it('redacts secrets and truncates long payloads', () => {
    const summary = summarizeToolArguments({
      nested: { authorization: 'Bearer x', note: 'use gf_abc123 please' },
      text: 'a'.repeat(1_000),
    });

    expect(summary).not.toContain('gf_abc123');
    expect(summary).not.toContain('Bearer x');
    expect(summary.length).toBeLessThanOrEqual(240);
  });
});
