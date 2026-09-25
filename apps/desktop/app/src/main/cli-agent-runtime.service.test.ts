import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import type {
  IDesktopCliAgentTurnEvent,
  IDesktopCloudAgentThread,
} from '@genfeedai/contracts/desktop';
import type { IAgentExternalTurnInput } from '@genfeedai/contracts/interfaces/ai/agent-external-turn.interface';
import { DESKTOP_CLI_AGENT_RUNTIMES } from './cli-agent-runtime.constants';
import {
  classifyDesktopCliAgentFailure,
  type DesktopCliAgentCloudClient,
  DesktopCliAgentRuntimeService,
  parseDesktopCliAgentTurnRequest,
} from './cli-agent-runtime.service';

const TOKEN = 'gf_live_desktop_secret_key';

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  killedWith: string[] = [];
  pid = 4242;
  signalCode: NodeJS.Signals | null = null;
  stderr = new PassThrough();
  stdinText = '';
  stdout = new PassThrough();
  stdin = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      this.stdinText += chunk.toString();
      callback();
    },
  });

  emitLines(lines: object[]): void {
    for (const line of lines) {
      this.stdout.write(`${JSON.stringify(line)}\n`);
    }
  }

  close(code: number): void {
    this.exitCode = code;
    this.stdout.end();
    this.stderr.end();
    setTimeout(() => this.emit('close', code, null), 5);
  }
}

interface SpawnCall {
  args: string[];
  command: string;
  options: SpawnOptions;
}

const thread = (
  overrides: Partial<IDesktopCloudAgentThread> = {},
): IDesktopCloudAgentThread => ({
  brandId: 'brand-1',
  externalRuntime: null,
  id: 'thread-1',
  organizationId: 'org-1',
  runtimeKey: 'local/claude-cli',
  ...overrides,
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('DesktopCliAgentRuntimeService', () => {
  let appended: Array<{ input: IAgentExternalTurnInput; threadId: string }>;
  let child: FakeChild;
  let cloud: DesktopCliAgentCloudClient & { created: object[] };
  let events: IDesktopCliAgentTurnEvent[];
  let logs: string[];
  let spawnCalls: SpawnCall[];
  let mcpFileDuringRun: string | null;
  let workDir: string;
  let session: string | null;

  const createService = (
    overrides: Partial<
      ConstructorParameters<typeof DesktopCliAgentRuntimeService>[0]
    > = {},
  ) =>
    new DesktopCliAgentRuntimeService({
      cloud,
      getMcpEndpoint: () => 'https://mcp.genfeed.ai/mcp',
      getSessionToken: () => session,
      killProcessTree: (target) => {
        (target as unknown as FakeChild).killedWith.push('tree');
        (target as unknown as FakeChild).close(143);
      },
      log: (_level, message) => logs.push(message),
      spawnProcess: (command, args, options) => {
        spawnCalls.push({ args, command, options });
        const configIndex = args.indexOf('--mcp-config');
        mcpFileDuringRun =
          configIndex === -1
            ? null
            : fs.readFileSync(args[configIndex + 1] as string, 'utf8');
        return child as unknown as ChildProcess;
      },
      workDir,
      ...overrides,
    });

  beforeEach(() => {
    appended = [];
    child = new FakeChild();
    events = [];
    logs = [];
    spawnCalls = [];
    mcpFileDuringRun = null;
    session = TOKEN;
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-cli-agent-'));
    cloud = {
      appendExternalAgentTurn: async (threadId, input) => {
        appended.push({ input, threadId });
        return thread();
      },
      createAgentThread: async (input) => {
        cloud.created.push(input);
        return thread({ id: 'thread-new' });
      },
      created: [],
      getAgentThread: async (threadId) => thread({ id: threadId }),
    };
  });

  afterEach(() => {
    fs.rmSync(workDir, { force: true, recursive: true });
  });

  it('runs a Claude turn, streams events, and saves it to the Genfeed thread', async () => {
    const service = createService();

    const handle = await service.startTurn(
      {
        prompt: 'Write a launch post',
        runtimeKey: 'local/claude-cli',
        threadId: 'thread-1',
        turnId: 'turn-12345678',
      },
      (event) => events.push(event),
    );

    expect(handle).toEqual({ threadId: 'thread-1', turnId: 'turn-12345678' });
    expect(spawnCalls[0]?.command).toBe('claude');
    expect(spawnCalls[0]?.options.cwd).toBe(path.join(workDir, 'workspace'));
    expect(spawnCalls[0]?.args.join(' ')).not.toContain(TOKEN);
    expect(spawnCalls[0]?.options.env?.GENFEED_API_KEY).toBeUndefined();
    expect(mcpFileDuringRun).toContain(TOKEN);
    const systemPrompt =
      spawnCalls[0]?.args[
        (spawnCalls[0]?.args.indexOf('--append-system-prompt') ?? 0) + 1
      ];
    expect(systemPrompt).toContain('get_brand_context');
    expect(systemPrompt).toContain('brand-1');

    child.emitLines([
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-1',
        model: 'sonnet',
      },
      {
        type: 'assistant',
        message: {
          id: 'm1',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'mcp__genfeed__get_brand_context',
              input: { brandId: 'brand-1' },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }],
        },
      },
      {
        type: 'assistant',
        message: { id: 'm2', content: [{ type: 'text', text: 'Done.' }] },
      },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Done.',
        session_id: 'sess-1',
        usage: { input_tokens: 10, output_tokens: 2 },
      },
    ]);
    child.close(0);

    await waitFor(() => events.some((item) => item.event.type === 'completed'));

    expect(child.stdinText).toBe('Write a launch post');
    expect(events.every((item) => item.turnId === 'turn-12345678')).toBe(true);
    expect(events.map((item) => item.event.type)).toEqual([
      'session',
      'tool-call-started',
      'tool-call-finished',
      'text-delta',
      'message',
      'usage',
      'completed',
    ]);
    expect(appended).toEqual([
      {
        input: expect.objectContaining({
          assistantMessage: 'Done.',
          model: 'sonnet',
          runtimeKey: 'local/claude-cli',
          sessionId: 'sess-1',
          toolCalls: [
            {
              argsSummary: '{"brandId":"brand-1"}',
              name: 'get_brand_context',
              resultSummary: 'ok',
              status: 'completed',
            },
          ],
          usage: { inputTokens: 10, outputTokens: 2 },
          userMessage: 'Write a launch post',
        }),
        threadId: 'thread-1',
      },
    ]);
    expect(events.at(-1)?.event).toMatchObject({
      isPersisted: true,
      sessionId: 'sess-1',
      text: 'Done.',
      type: 'completed',
    });
    expect(fs.readdirSync(path.join(workDir, 'mcp'))).toEqual([]);
    expect(logs.join('\n')).not.toContain(TOKEN);
    expect(service.hasActiveTurns()).toBe(false);
  });

  it('creates a thread for the runtime and resumes only matching sessions', async () => {
    const service = createService();

    const handle = await service.startTurn(
      {
        brandId: 'brand-7',
        prompt: 'Plan my week',
        runtimeKey: 'local/codex-cli',
        turnId: 'turn-abcdefgh',
      },
      (event) => events.push(event),
    );

    expect(handle.threadId).toBe('thread-new');
    expect(cloud.created).toEqual([
      {
        brandId: 'brand-7',
        runtimeKey: 'local/codex-cli',
        source: 'desktop-cli',
        title: 'Plan my week',
      },
    ]);
    expect(spawnCalls[0]?.command).toBe('codex');
    expect(spawnCalls[0]?.args).not.toContain('resume');
    expect(spawnCalls[0]?.options.env?.GENFEED_API_KEY).toBe(TOKEN);
    expect(spawnCalls[0]?.args.join(' ')).not.toContain(TOKEN);
    expect(child.stdinText).toContain('You are the Genfeed agent');
    expect(child.stdinText.endsWith('Plan my week')).toBe(true);
    child.close(0);
    await waitFor(() => events.length > 0);

    cloud.getAgentThread = async () =>
      thread({
        externalRuntime: {
          runtimeKey: 'local/codex-cli',
          sessionId: 'codex-thread-1',
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
      });
    child = new FakeChild();
    await service.startTurn(
      {
        prompt: 'Continue',
        runtimeKey: 'local/codex-cli',
        threadId: 'thread-1',
        turnId: 'turn-second1',
      },
      () => {},
    );
    expect(spawnCalls[1]?.args.slice(-3)).toEqual([
      'resume',
      'codex-thread-1',
      '-',
    ]);
    expect(child.stdinText).toBe('Continue');
    child.close(0);

    child = new FakeChild();
    await service.startTurn(
      {
        prompt: 'Switch CLIs',
        runtimeKey: 'local/claude-cli',
        threadId: 'thread-1',
        turnId: 'turn-third12',
      },
      () => {},
    );
    expect(spawnCalls[2]?.args).not.toContain('--resume');
    child.close(0);
  });

  it('reports a missing CLI with install and login instructions', async () => {
    const service = createService();
    await service.startTurn(
      {
        prompt: 'Hi',
        runtimeKey: 'local/claude-cli',
        threadId: 'thread-1',
        turnId: 'turn-missing1',
      },
      (event) => events.push(event),
    );

    child.emit(
      'error',
      Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }),
    );

    await waitFor(() => events.length > 0);
    expect(events[0]?.event).toMatchObject({
      code: 'binary-not-found',
      type: 'error',
    });
    expect(
      events[0]?.event.type === 'error' ? events[0].event.message : '',
    ).toContain('claude auth login');
    expect(appended).toEqual([]);
    expect(fs.readdirSync(path.join(workDir, 'mcp'))).toEqual([]);
  });

  it('turns an unauthenticated CLI into an actionable login message', async () => {
    const service = createService();
    await service.startTurn(
      {
        prompt: 'Hi',
        runtimeKey: 'local/codex-cli',
        threadId: 'thread-1',
        turnId: 'turn-noauth12',
      },
      (event) => events.push(event),
    );

    child.stderr.write('Error: Not logged in. Please run codex login\n');
    child.close(1);

    await waitFor(() => events.length > 0);
    expect(events[0]?.event).toMatchObject({
      code: 'not-authenticated',
      type: 'error',
    });
    expect(
      events[0]?.event.type === 'error' ? events[0].event.message : '',
    ).toContain('`codex login`');
  });

  it('cancels a running turn by killing the process tree', async () => {
    const service = createService();
    await service.startTurn(
      {
        prompt: 'Long task',
        runtimeKey: 'local/claude-cli',
        threadId: 'thread-1',
        turnId: 'turn-cancel12',
      },
      (event) => events.push(event),
    );

    service.cancelTurn('turn-cancel12');

    await waitFor(() => events.length > 0);
    expect(child.killedWith).toEqual(['tree']);
    expect(events[0]?.event).toEqual({
      code: 'cancelled',
      message: 'Stopped.',
      type: 'error',
    });
    expect(appended).toEqual([]);
  });

  it('stops turns that go idle', async () => {
    const service = createService({ idleTimeoutMs: 20 });
    await service.startTurn(
      {
        prompt: 'Hang',
        runtimeKey: 'local/claude-cli',
        threadId: 'thread-1',
        turnId: 'turn-timeout1',
      },
      (event) => events.push(event),
    );

    await waitFor(() => events.length > 0);
    expect(events[0]?.event).toMatchObject({ code: 'timeout', type: 'error' });
  });

  it('still completes when the thread cannot be saved', async () => {
    cloud.appendExternalAgentTurn = async () => {
      throw new Error(`Desktop cloud request failed: 500 (${TOKEN})`);
    };
    const service = createService();
    await service.startTurn(
      {
        prompt: 'Hi',
        runtimeKey: 'local/claude-cli',
        threadId: 'thread-1',
        turnId: 'turn-persist1',
      },
      (event) => events.push(event),
    );

    child.emitLines([
      { type: 'result', subtype: 'success', result: 'Hello', session_id: 's' },
    ]);
    child.close(0);

    await waitFor(() => events.some((item) => item.event.type === 'completed'));
    const completed = events.at(-1)?.event;
    expect(completed).toMatchObject({ isPersisted: false, type: 'completed' });
    expect(JSON.stringify(completed)).not.toContain(TOKEN);
  });

  it('requires a Genfeed desktop session', async () => {
    session = null;
    const service = createService();

    await expect(
      service.startTurn(
        {
          prompt: 'Hi',
          runtimeKey: 'local/claude-cli',
          turnId: 'turn-nosess12',
        },
        () => {},
      ),
    ).rejects.toThrow(/Sign in to Genfeed/);
    expect(spawnCalls).toEqual([]);
  });
});

describe('parseDesktopCliAgentTurnRequest', () => {
  const valid = {
    prompt: 'Hi',
    runtimeKey: 'local/claude-cli',
    turnId: 'turn-12345678',
  };

  it('accepts a minimal request', () => {
    expect(parseDesktopCliAgentTurnRequest(valid)).toEqual({
      brandId: null,
      prompt: 'Hi',
      runtimeKey: 'local/claude-cli',
      threadId: null,
      turnId: 'turn-12345678',
    });
  });

  it('rejects unknown runtimes, bad ids, and empty prompts', () => {
    expect(() =>
      parseDesktopCliAgentTurnRequest({
        ...valid,
        runtimeKey: 'hosted/genfeed',
      }),
    ).toThrow(/runtime/);
    expect(() =>
      parseDesktopCliAgentTurnRequest({ ...valid, threadId: '--resume x' }),
    ).toThrow(/thread id/);
    expect(() =>
      parseDesktopCliAgentTurnRequest({ ...valid, turnId: '../x' }),
    ).toThrow(/turn id/);
    expect(() =>
      parseDesktopCliAgentTurnRequest({ ...valid, prompt: '   ' }),
    ).toThrow();
  });
});

describe('classifyDesktopCliAgentFailure', () => {
  it('keeps non-auth failures as process failures', () => {
    expect(
      classifyDesktopCliAgentFailure(
        DESKTOP_CLI_AGENT_RUNTIMES['local/claude-cli'],
        'Rate limited',
      ),
    ).toEqual({
      code: 'process-failed',
      message: 'Claude Code failed: Rate limited',
    });
  });
});
