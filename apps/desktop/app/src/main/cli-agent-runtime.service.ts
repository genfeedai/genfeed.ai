import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGENT_EXTERNAL_RUNTIME_THREAD_SOURCE,
  isAgentExternalRuntimeKey,
} from '@genfeedai/contracts/constants/agent-external-runtime.constant';
import type {
  DesktopCliAgentErrorCode,
  DesktopCliAgentEvent,
  IDesktopCliAgentToolCall,
  IDesktopCliAgentTurnEvent,
  IDesktopCliAgentTurnHandle,
  IDesktopCliAgentTurnRequest,
  IDesktopCloudAgentThread,
} from '@genfeedai/contracts/desktop';
import type {
  IAgentExternalTurnInput,
  IAgentExternalTurnToolCall,
} from '@genfeedai/contracts/interfaces/ai/agent-external-turn.interface';
import {
  buildClaudeCliArgs,
  buildCodexCliArgs,
  type ClaudeMcpConfigFile,
  removeStaleClaudeMcpConfigs,
  writeClaudeMcpConfig,
} from './cli-agent-args.util';
import {
  buildDesktopCliAgentSystemPrompt,
  DESKTOP_CLI_AGENT_IDLE_TIMEOUT_MS,
  DESKTOP_CLI_AGENT_KILL_GRACE_MS,
  DESKTOP_CLI_AGENT_MAX_PROMPT_LENGTH,
  DESKTOP_CLI_AGENT_RUNTIMES,
  DESKTOP_CLI_AGENT_TURN_TIMEOUT_MS,
  type DesktopCliAgentRuntimeDefinition,
  GENFEED_MCP_TOKEN_ENV_VAR,
} from './cli-agent-runtime.constants';
import {
  type CliAgentParsedResult,
  type CliAgentStreamParser,
  createCliAgentStreamParser,
} from './cli-agent-stream-parser';
import { buildDesktopToolPath } from './local-tools.util';

const TURN_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const STDERR_TAIL_BYTES = 4_096;
const AUTH_FAILURE_PATTERN =
  /(not logged in|please run \/login|log ?in|authenticat|unauthori[sz]ed|invalid api key|api key|oauth token|\b401\b|credentials)/i;

export class DesktopCliAgentRequestError extends Error {}

/** The Genfeed API calls the runtime needs (implemented by DesktopCloudService). */
export interface DesktopCliAgentCloudClient {
  appendExternalAgentTurn(
    threadId: string,
    input: IAgentExternalTurnInput,
  ): Promise<IDesktopCloudAgentThread>;
  createAgentThread(input: {
    brandId: string | null;
    runtimeKey: IDesktopCliAgentTurnRequest['runtimeKey'];
    source: string;
    title: string;
  }): Promise<IDesktopCloudAgentThread>;
  getAgentThread(threadId: string): Promise<IDesktopCloudAgentThread>;
}

export type DesktopCliAgentSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

export interface DesktopCliAgentRuntimeServiceOptions {
  cloud: DesktopCliAgentCloudClient;
  getMcpEndpoint: () => string;
  getSessionToken: () => string | null;
  idleTimeoutMs?: number;
  killProcessTree?: (child: ChildProcess) => void;
  log?: (level: 'error' | 'info', message: string) => void;
  now?: () => Date;
  spawnProcess?: DesktopCliAgentSpawn;
  turnTimeoutMs?: number;
  /** Private directory under the Electron userData dir. */
  workDir: string;
}

type TurnStopReason = 'cancelled' | 'timeout';

interface ActiveCliTurn {
  child: ChildProcess;
  emit: (event: DesktopCliAgentEvent) => void;
  idleTimer: NodeJS.Timeout | null;
  isFinished: boolean;
  mcpConfig: ClaudeMcpConfigFile | null;
  model?: string;
  parser: CliAgentStreamParser;
  request: IDesktopCliAgentTurnRequest;
  result: CliAgentParsedResult | null;
  runtime: DesktopCliAgentRuntimeDefinition;
  startedAt: string;
  stderrTail: string;
  stdoutBuffer: string;
  stopReason: TurnStopReason | null;
  threadId: string;
  turnTimer: NodeJS.Timeout | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalEntityId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value)) {
    throw new DesktopCliAgentRequestError(`Invalid ${field}.`);
  }

  return value;
}

/** Validates renderer input; the renderer is never trusted with CLI args. */
export function parseDesktopCliAgentTurnRequest(
  value: unknown,
): IDesktopCliAgentTurnRequest {
  if (!isRecord(value)) {
    throw new DesktopCliAgentRequestError('Invalid agent turn request.');
  }

  if (!isAgentExternalRuntimeKey(value.runtimeKey)) {
    throw new DesktopCliAgentRequestError('Unsupported local agent runtime.');
  }

  if (typeof value.turnId !== 'string' || !TURN_ID_PATTERN.test(value.turnId)) {
    throw new DesktopCliAgentRequestError('Invalid agent turn id.');
  }

  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!prompt) {
    throw new DesktopCliAgentRequestError('Type a message first.');
  }

  if (prompt.length > DESKTOP_CLI_AGENT_MAX_PROMPT_LENGTH) {
    throw new DesktopCliAgentRequestError('That message is too long.');
  }

  return {
    brandId: readOptionalEntityId(value.brandId, 'brand id'),
    prompt,
    runtimeKey: value.runtimeKey,
    threadId: readOptionalEntityId(value.threadId, 'thread id'),
    turnId: value.turnId,
  };
}

/** Maps a raw CLI failure to an actionable message. */
export function classifyDesktopCliAgentFailure(
  runtime: DesktopCliAgentRuntimeDefinition,
  rawMessage: string,
): { code: DesktopCliAgentErrorCode; message: string } {
  const message = rawMessage.trim();

  if (AUTH_FAILURE_PATTERN.test(message)) {
    return {
      code: 'not-authenticated',
      message: `${runtime.label} is not signed in. Run \`${runtime.loginCommand}\` in a terminal (Genfeed Desktop has a ${runtime.label} terminal in the agent panel), then send your message again.`,
    };
  }

  return {
    code: 'process-failed',
    message: message
      ? `${runtime.label} failed: ${message.slice(0, 600)}`
      : `${runtime.label} stopped unexpectedly.`,
  };
}

export function killDesktopCliProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
    return;
  }

  const pid = child.pid;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  const signalTree = (signal: NodeJS.Signals): void => {
    try {
      // The CLI runs detached as its own process group leader.
      process.kill(-pid, signal);
    } catch {
      child.kill(signal);
    }
  };

  signalTree('SIGTERM');
  const forceKill = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      signalTree('SIGKILL');
    }
  }, DESKTOP_CLI_AGENT_KILL_GRACE_MS);
  forceKill.unref();
}

function redactSecrets(value: string): string {
  return value
    .replace(/\bgf_[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

function toPersistedToolCall(
  toolCall: IDesktopCliAgentToolCall,
): IAgentExternalTurnToolCall {
  const isFailed = toolCall.status !== 'completed';

  return {
    ...(toolCall.argsSummary ? { argsSummary: toolCall.argsSummary } : {}),
    ...(isFailed
      ? { error: toolCall.error ?? 'The tool call did not finish.' }
      : {}),
    name: toolCall.name,
    ...(toolCall.resultSummary
      ? { resultSummary: toolCall.resultSummary }
      : {}),
    status: isFailed ? 'failed' : 'completed',
  };
}

/**
 * Runs Genfeed agent turns on the user's own Claude Code / Codex CLI.
 * Genfeed stays the system of record: the CLI reaches brand context and
 * actions through the Genfeed MCP server with the desktop `gf_` key, and
 * each finished turn is appended to the Genfeed thread (no credit billing).
 * Works in cloud and local mode; it never depends on the PGlite runtime.
 */
export class DesktopCliAgentRuntimeService {
  private readonly turns = new Map<string, ActiveCliTurn>();
  private readonly idleTimeoutMs: number;
  private readonly killProcessTree: (child: ChildProcess) => void;
  private readonly mcpConfigDir: string;
  private readonly now: () => Date;
  private readonly spawnProcess: DesktopCliAgentSpawn;
  private readonly turnTimeoutMs: number;
  private readonly workspaceDir: string;

  constructor(private readonly options: DesktopCliAgentRuntimeServiceOptions) {
    this.idleTimeoutMs =
      options.idleTimeoutMs ?? DESKTOP_CLI_AGENT_IDLE_TIMEOUT_MS;
    this.killProcessTree = options.killProcessTree ?? killDesktopCliProcessTree;
    this.mcpConfigDir = path.join(options.workDir, 'mcp');
    this.now = options.now ?? (() => new Date());
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.turnTimeoutMs =
      options.turnTimeoutMs ?? DESKTOP_CLI_AGENT_TURN_TIMEOUT_MS;
    this.workspaceDir = path.join(options.workDir, 'workspace');

    try {
      removeStaleClaudeMcpConfigs(this.mcpConfigDir);
    } catch {
      // Best effort; each turn writes a fresh uniquely named file.
    }
  }

  hasActiveTurns(): boolean {
    return this.turns.size > 0;
  }

  async startTurn(
    rawRequest: unknown,
    emit: (event: IDesktopCliAgentTurnEvent) => void,
  ): Promise<IDesktopCliAgentTurnHandle> {
    const request = parseDesktopCliAgentTurnRequest(rawRequest);

    if (this.turns.has(request.turnId)) {
      throw new DesktopCliAgentRequestError(
        'That agent turn is already running.',
      );
    }

    const token = this.options.getSessionToken();
    if (!token) {
      throw new DesktopCliAgentRequestError(
        'Sign in to Genfeed in Desktop first. Your threads, brand context, and memory are stored in your Genfeed account.',
      );
    }

    const runtime = DESKTOP_CLI_AGENT_RUNTIMES[request.runtimeKey];
    const thread = request.threadId
      ? await this.options.cloud.getAgentThread(request.threadId)
      : await this.options.cloud.createAgentThread({
          brandId: request.brandId ?? null,
          runtimeKey: request.runtimeKey,
          source: AGENT_EXTERNAL_RUNTIME_THREAD_SOURCE,
          title: request.prompt.replace(/\s+/g, ' ').slice(0, 60),
        });
    const resumeSessionId =
      thread.externalRuntime?.runtimeKey === request.runtimeKey
        ? thread.externalRuntime.sessionId
        : null;

    this.launch({
      emit: (event) =>
        emit({ event, threadId: thread.id, turnId: request.turnId }),
      request,
      resumeSessionId,
      runtime,
      systemPrompt: buildDesktopCliAgentSystemPrompt({
        brandId: thread.brandId,
        organizationId: thread.organizationId,
        runtimeLabel: runtime.label,
        threadId: thread.id,
      }),
      threadId: thread.id,
      token,
    });

    return { threadId: thread.id, turnId: request.turnId };
  }

  cancelTurn(turnId: unknown): void {
    if (typeof turnId !== 'string') {
      return;
    }

    const turn = this.turns.get(turnId);
    if (!turn || turn.isFinished) {
      return;
    }

    turn.stopReason ??= 'cancelled';
    this.killProcessTree(turn.child);
  }

  cancelAll(): void {
    for (const turnId of this.turns.keys()) {
      this.cancelTurn(turnId);
    }
  }

  private launch(params: {
    emit: (event: DesktopCliAgentEvent) => void;
    request: IDesktopCliAgentTurnRequest;
    resumeSessionId: string | null;
    runtime: DesktopCliAgentRuntimeDefinition;
    systemPrompt: string;
    threadId: string;
    token: string;
  }): void {
    const { request, runtime } = params;
    const mcpEndpoint = this.options.getMcpEndpoint();
    fs.mkdirSync(this.workspaceDir, { mode: 0o700, recursive: true });

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: buildDesktopToolPath(),
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment[GENFEED_MCP_TOKEN_ENV_VAR];

    let mcpConfig: ClaudeMcpConfigFile | null = null;
    let args: string[];
    let stdinText: string;

    if (runtime.provider === 'claude') {
      mcpConfig = writeClaudeMcpConfig({
        directory: this.mcpConfigDir,
        mcpEndpoint,
        token: params.token,
        turnId: request.turnId,
      });
      args = buildClaudeCliArgs({
        mcpConfigPath: mcpConfig.path,
        resumeSessionId: params.resumeSessionId,
        systemPrompt: params.systemPrompt,
      });
      stdinText = request.prompt;
    } else {
      environment[GENFEED_MCP_TOKEN_ENV_VAR] = params.token;
      args = buildCodexCliArgs({
        mcpEndpoint,
        resumeSessionId: params.resumeSessionId,
      });
      // Codex has no append-system-prompt flag; the instructions open the
      // session and persist across `codex exec resume`.
      stdinText = params.resumeSessionId
        ? request.prompt
        : `${params.systemPrompt}\n\n---\n\n${request.prompt}`;
    }

    let child: ChildProcess;
    try {
      child = this.spawnProcess(runtime.command, args, {
        cwd: this.workspaceDir,
        detached: process.platform !== 'win32',
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      mcpConfig?.cleanup();
      throw error;
    }

    const turn: ActiveCliTurn = {
      child,
      emit: params.emit,
      idleTimer: null,
      isFinished: false,
      mcpConfig,
      parser: createCliAgentStreamParser(runtime.provider),
      request,
      result: null,
      runtime,
      startedAt: this.now().toISOString(),
      stderrTail: '',
      stdoutBuffer: '',
      stopReason: null,
      threadId: params.threadId,
      turnTimer: null,
    };
    this.turns.set(request.turnId, turn);
    this.options.log?.(
      'info',
      `cli agent turn started runtime=${request.runtimeKey} thread=${params.threadId} resume=${params.resumeSessionId ? 'yes' : 'no'}`,
    );

    turn.turnTimer = setTimeout(
      () => this.stopForTimeout(turn),
      this.turnTimeoutMs,
    );
    this.touchIdleTimer(turn);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.handleStdout(turn, chunk));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      turn.stderrTail = `${turn.stderrTail}${chunk}`.slice(-STDERR_TAIL_BYTES);
      this.touchIdleTimer(turn);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        void this.finish(turn, {
          code: 'binary-not-found',
          message: `${runtime.label} (\`${runtime.command}\`) was not found on this computer. Install it with \`${runtime.installCommand}\`, sign in with \`${runtime.loginCommand}\`, then restart Genfeed Desktop.`,
        });
        return;
      }

      void this.finish(turn, {
        code: 'process-failed',
        message: `${runtime.label} could not start: ${redactSecrets(error.message)}`,
      });
    });
    child.on('close', () => {
      if (turn.stdoutBuffer.trim()) {
        this.handleLine(turn, turn.stdoutBuffer);
        turn.stdoutBuffer = '';
      }
      void this.finish(turn, null);
    });

    child.stdin?.on('error', () => {
      // EPIPE when the CLI exits before reading stdin; `close` reports why.
    });
    child.stdin?.end(stdinText);
  }

  private touchIdleTimer(turn: ActiveCliTurn): void {
    if (turn.idleTimer) {
      clearTimeout(turn.idleTimer);
    }
    turn.idleTimer = setTimeout(
      () => this.stopForTimeout(turn),
      this.idleTimeoutMs,
    );
  }

  private stopForTimeout(turn: ActiveCliTurn): void {
    if (turn.isFinished) {
      return;
    }
    turn.stopReason ??= 'timeout';
    this.killProcessTree(turn.child);
  }

  private handleStdout(turn: ActiveCliTurn, chunk: string): void {
    this.touchIdleTimer(turn);
    turn.stdoutBuffer += chunk;

    let newlineIndex = turn.stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = turn.stdoutBuffer.slice(0, newlineIndex);
      turn.stdoutBuffer = turn.stdoutBuffer.slice(newlineIndex + 1);
      this.handleLine(turn, line);
      newlineIndex = turn.stdoutBuffer.indexOf('\n');
    }
  }

  private handleLine(turn: ActiveCliTurn, line: string): void {
    if (turn.isFinished) {
      return;
    }

    for (const event of turn.parser.parseLine(line)) {
      if (event.type === 'result') {
        turn.result = event.result;
        continue;
      }

      if (event.type === 'session' && event.model) {
        turn.model = event.model;
      }

      turn.emit(event);
    }
  }

  private async finish(
    turn: ActiveCliTurn,
    failure: { code: DesktopCliAgentErrorCode; message: string } | null,
  ): Promise<void> {
    if (turn.isFinished) {
      return;
    }

    turn.isFinished = true;
    if (turn.turnTimer) clearTimeout(turn.turnTimer);
    if (turn.idleTimer) clearTimeout(turn.idleTimer);
    this.turns.delete(turn.request.turnId);

    try {
      turn.mcpConfig?.cleanup();
    } catch {
      this.options.log?.('error', 'cli agent MCP config cleanup failed');
    }

    const error = this.resolveFailure(turn, failure);
    const result = turn.result;
    if (error || !result) {
      const reported = error ?? {
        code: 'process-failed' as const,
        message: `${turn.runtime.label} exited without a result.`,
      };
      this.options.log?.(
        'error',
        `cli agent turn failed runtime=${turn.request.runtimeKey} code=${reported.code}`,
      );
      turn.emit({ ...reported, type: 'error' });
      return;
    }

    const toolCalls = turn.parser.getToolCalls();
    const sessionId = result.sessionId ?? turn.parser.getSessionId();
    const text = result.text || turn.parser.getText();
    let isPersisted = true;
    let persistError: string | undefined;

    try {
      await this.options.cloud.appendExternalAgentTurn(turn.threadId, {
        assistantMessage: text,
        completedAt: this.now().toISOString(),
        ...(turn.model ? { model: turn.model } : {}),
        runtimeKey: turn.request.runtimeKey,
        ...(sessionId ? { sessionId } : {}),
        startedAt: turn.startedAt,
        toolCalls: toolCalls.map(toPersistedToolCall),
        ...(result.usage ? { usage: result.usage } : {}),
        userMessage: turn.request.prompt,
      });
    } catch (persistFailure) {
      isPersisted = false;
      persistError =
        persistFailure instanceof Error
          ? redactSecrets(persistFailure.message)
          : 'The turn could not be saved to Genfeed.';
      this.options.log?.(
        'error',
        `cli agent turn could not be saved thread=${turn.threadId}: ${persistError}`,
      );
    }

    turn.emit({
      isPersisted,
      ...(persistError ? { persistError } : {}),
      sessionId,
      text,
      toolCalls,
      type: 'completed',
      ...(result.usage ? { usage: result.usage } : {}),
    });
  }

  private resolveFailure(
    turn: ActiveCliTurn,
    failure: { code: DesktopCliAgentErrorCode; message: string } | null,
  ): { code: DesktopCliAgentErrorCode; message: string } | null {
    if (turn.stopReason === 'cancelled') {
      return { code: 'cancelled', message: 'Stopped.' };
    }

    if (turn.stopReason === 'timeout') {
      return {
        code: 'timeout',
        message: `${turn.runtime.label} did not finish in time and was stopped.`,
      };
    }

    if (failure) {
      return failure;
    }

    if (turn.result && !turn.result.isError) {
      return null;
    }

    const rawMessage =
      turn.result?.errorMessage ??
      turn.parser.getLastError() ??
      turn.stderrTail ??
      '';
    const exitCode = turn.child.exitCode;
    return classifyDesktopCliAgentFailure(
      turn.runtime,
      redactSecrets(
        rawMessage.trim() ||
          (exitCode !== null
            ? `exited with code ${String(exitCode)}`
            : 'exited without a result'),
      ),
    );
  }
}
