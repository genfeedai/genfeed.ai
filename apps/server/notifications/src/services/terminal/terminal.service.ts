import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { IBetterAuthJwksVerifierOptions } from '@genfeedai/interfaces';
import {
  createBetterAuthJwksVerifierOptions,
  resolveBetterAuthJwksUrl,
  resolveBetterAuthTokenUrl,
} from '@libs/auth/better-auth-jwks.verifier';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import type {
  IPtyAdapter,
  IPtyHandle,
  IPtySubscription,
} from './pty/pty-adapter.interface';
import { PTY_ADAPTER } from './pty/pty-adapter.interface';
import type {
  TerminalCreatePayload,
  TerminalDataPayload,
  TerminalExitPayload,
  TerminalSessionDto,
  TerminalSessionKind,
} from './terminal.types';

/** Maximum bytes retained in the per-session scrollback ring buffer. */
const MAX_BUFFER_BYTES = 256 * 1024;

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const MAX_COLS = 240;
const MAX_ROWS = 80;

const TERMINAL_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

const COMMAND_LABELS: Record<TerminalSessionKind, string> = {
  claude: 'Claude CLI (`claude`)',
  codex: 'Codex CLI (`codex`)',
  genfeed: 'Genfeed CLI (`gf`)',
  shell: 'Shell',
};

interface ScrollbackBuffer {
  /** Ordered chunks of raw pty output. */
  chunks: Buffer[];
  /** Current total byte count across all chunks. */
  totalBytes: number;
}

interface TerminalProcess {
  /** Subscription for live pty data forwarded to the current active socket. */
  dataSubscription: IPtySubscription;
  /** ISO timestamp of session creation. */
  createdAt: string;
  /** Resolved command string for display purposes. */
  command: string;
  /** Resolved working directory. */
  cwd: string;
  exitSubscription: IPtySubscription;
  /** Session kind. */
  kind: TerminalSessionKind;
  /** Socket currently receiving live pty output. */
  ownerSocketId: string;
  /** genfeed User.id (Better Auth `sub`) that owns this session. */
  ownerUserId: string;
  pty: IPtyHandle;
  /** Ring buffer holding last MAX_BUFFER_BYTES of output. */
  scrollback: ScrollbackBuffer;
  /** Optional thread this session is bound to. */
  threadId?: string;
}

interface TerminalCallbacks {
  onData: (payload: TerminalDataPayload) => void;
  onExit: (payload: TerminalExitPayload) => void;
}

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);
  private readonly sessions = new Map<string, TerminalProcess>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(PTY_ADAPTER) private readonly ptyAdapter: IPtyAdapter,
  ) {}

  createSession(
    ownerSocketId: string,
    ownerUserId: string,
    payload: TerminalCreatePayload | undefined,
    callbacks: TerminalCallbacks,
  ): TerminalSessionDto {
    this.assertAvailable();

    const kind = this.normalizeKind(payload?.kind);
    const cwd = this.resolveWorkingDirectory(payload?.cwd);
    const { args, command } = this.resolveCommand(kind);
    const sessionId = randomUUID();
    const threadId =
      typeof payload?.threadId === 'string' && payload.threadId.trim()
        ? payload.threadId.trim()
        : undefined;

    this.ptyAdapter.ensureReady();

    let pty: IPtyHandle;
    try {
      pty = this.ptyAdapter.spawn({
        args,
        cols: this.clampDimension(payload?.cols, DEFAULT_COLS, MAX_COLS),
        command,
        cwd,
        env: this.buildEnvironment(),
        kind,
        name: 'xterm-256color',
        rows: this.clampDimension(payload?.rows, DEFAULT_ROWS, MAX_ROWS),
      });
    } catch (error) {
      throw new Error(this.formatSpawnError(kind, command, error));
    }

    const scrollback: ScrollbackBuffer = { chunks: [], totalBytes: 0 };
    const createdAt = new Date().toISOString();

    const dataSubscription = pty.onData((data) => {
      this.appendScrollback(scrollback, data);
      callbacks.onData({ data, sessionId });
    });

    const exitSubscription = pty.onExit(({ exitCode, signal }) => {
      this.sessions.delete(sessionId);
      callbacks.onExit({ exitCode, sessionId, signal });
    });

    this.sessions.set(sessionId, {
      command,
      createdAt,
      cwd,
      dataSubscription,
      exitSubscription,
      kind,
      ownerSocketId,
      ownerUserId,
      pty,
      scrollback,
      threadId,
    });

    this.logger.log(`Started local terminal session`, {
      command,
      cwd,
      kind,
      ownerSocketId,
      ownerUserId,
      sessionId,
      threadId,
    });

    return {
      command,
      createdAt,
      cwd,
      id: sessionId,
      kind,
      pid: pty.pid,
      threadId,
    };
  }

  isAvailable(): boolean {
    const isCloud =
      process.env.GENFEED_CLOUD === 'true' ||
      process.env.NEXT_PUBLIC_GENFEED_CLOUD === 'true';
    const explicitlyEnabled = this.configService.get('GENFEED_LOCAL_TERMINAL');
    const isDevelopment =
      this.configService.get('NODE_ENV') === 'development' ||
      process.env.NODE_ENV === 'development';

    return !isCloud && (isDevelopment || explicitlyEnabled === 'true');
  }

  /**
   * Better Auth JWKS endpoint the terminal gateway verifies socket JWTs against.
   * The jwt plugin (in the API process) publishes JWKS at
   * `${BETTER_AUTH_URL}/v1/auth/jwks`; falls back to `API_BASE_URL` then
   * localhost so a default local boot works (epic #735, Phase 4 — D3).
   */
  getBetterAuthJwksUrl(): string {
    return resolveBetterAuthJwksUrl(this.getBetterAuthBaseUrl());
  }

  getBetterAuthTokenUrl(): string {
    return resolveBetterAuthTokenUrl(this.getBetterAuthBaseUrl());
  }

  getBetterAuthJwksVerifierOptions(): IBetterAuthJwksVerifierOptions {
    return createBetterAuthJwksVerifierOptions(this.getBetterAuthBaseUrl());
  }

  private getBetterAuthBaseUrl(): string {
    const baseUrl =
      this.configService.get('BETTER_AUTH_URL') ||
      this.configService.get('API_BASE_URL') ||
      'http://localhost:3010';
    return baseUrl;
  }

  /**
   * Returns all sessions owned by the given user id.
   */
  listForOwner(ownerUserId: string): TerminalSessionDto[] {
    const result: TerminalSessionDto[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.ownerUserId === ownerUserId) {
        result.push(this.toDto(sessionId, session));
      }
    }

    return result;
  }

  /**
   * Rebinds the live pty output stream to a new socket.  Ownership is
   * verified by userId only (socketId rebinds freely on reconnect).
   * Flushes the scrollback buffer to the new socket before wiring live data.
   */
  attach(
    newSocketId: string,
    ownerUserId: string,
    sessionId: string,
    callbacks: TerminalCallbacks,
  ): TerminalSessionDto | null {
    const session = this.sessions.get(sessionId);

    if (!session || session.ownerUserId !== ownerUserId) {
      return null;
    }

    // Dispose the previous socket's live subscription.
    session.dataSubscription.dispose();

    // Flush scrollback to the newly attached socket before going live.
    const buffered = this.drainScrollback(session.scrollback);
    if (buffered.length > 0) {
      callbacks.onData({ data: buffered, sessionId });
    }

    // Wire the new live subscription.
    const dataSubscription = session.pty.onData((data) => {
      this.appendScrollback(session.scrollback, data);
      callbacks.onData({ data, sessionId });
    });

    session.dataSubscription = dataSubscription;
    session.ownerSocketId = newSocketId;

    this.logger.log('Reattached terminal session to new socket', {
      newSocketId,
      ownerUserId,
      sessionId,
    });

    return this.toDto(sessionId, session);
  }

  killAllForSocket(ownerSocketId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.ownerSocketId === ownerSocketId) {
        this.killSession(ownerSocketId, session.ownerUserId, sessionId);
      }
    }
  }

  killSession(
    ownerSocketId: string,
    ownerUserId: string,
    sessionId: string,
  ): void {
    const session = this.getOwnedSession(ownerSocketId, ownerUserId, sessionId);

    if (!session) {
      return;
    }

    session.dataSubscription.dispose();
    session.exitSubscription.dispose();
    session.pty.kill();
    this.sessions.delete(sessionId);
  }

  resizeSession(
    ownerSocketId: string,
    ownerUserId: string,
    sessionId: string,
    cols: number,
    rows: number,
  ): void {
    this.getOwnedSession(ownerSocketId, ownerUserId, sessionId)?.pty.resize(
      this.clampDimension(cols, DEFAULT_COLS, MAX_COLS),
      this.clampDimension(rows, DEFAULT_ROWS, MAX_ROWS),
    );
  }

  writeSession(
    ownerSocketId: string,
    ownerUserId: string,
    sessionId: string,
    data: string,
  ): void {
    this.getOwnedSession(ownerSocketId, ownerUserId, sessionId)?.pty.write(
      data,
    );
  }

  private assertAvailable(): void {
    if (!this.isAvailable()) {
      throw new Error(
        'Local terminal is disabled. Set GENFEED_LOCAL_TERMINAL=true for self-hosted production.',
      );
    }
  }

  private buildEnvironment(): NodeJS.ProcessEnv {
    const existingPath = process.env.PATH ?? '';
    const nextPath = [
      ...TERMINAL_PATHS,
      ...existingPath.split(':').filter(Boolean),
    ].join(':');

    return {
      ...process.env,
      COLORTERM: process.env.COLORTERM ?? 'truecolor',
      PATH: nextPath,
      TERM: 'xterm-256color',
    };
  }

  private clampDimension(
    value: number | undefined,
    fallback: number,
    maximum: number,
  ): number {
    if (!value || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(10, Math.min(maximum, Math.floor(value)));
  }

  private formatSpawnError(
    kind: TerminalSessionKind,
    command: string,
    error: unknown,
  ): string {
    if (this.isMissingCommandError(error)) {
      if (kind === 'shell') {
        return `Shell command (${command}) is unavailable. Check SHELL or install a valid local shell.`;
      }

      return `${COMMAND_LABELS[kind]} is not installed or not on PATH. Install it locally or choose Shell.`;
    }

    const message = error instanceof Error ? error.message : String(error);
    return `Failed to start ${COMMAND_LABELS[kind]}: ${message}`;
  }

  /**
   * Strict ownership check: active socket AND userId must both match.
   * Used for write / resize / kill by the currently-bound socket.
   */
  private getOwnedSession(
    ownerSocketId: string,
    ownerUserId: string,
    sessionId: string,
  ): TerminalProcess | null {
    const session = this.sessions.get(sessionId);

    if (
      !session ||
      session.ownerSocketId !== ownerSocketId ||
      session.ownerUserId !== ownerUserId
    ) {
      return null;
    }

    return session;
  }

  private normalizeKind(
    kind: TerminalSessionKind | undefined,
  ): TerminalSessionKind {
    if (
      kind === 'claude' ||
      kind === 'codex' ||
      kind === 'genfeed' ||
      kind === 'shell'
    ) {
      return kind;
    }

    return 'shell';
  }

  private resolveCommand(kind: TerminalSessionKind): {
    args: string[];
    command: string;
  } {
    if (kind === 'claude') {
      return { args: [], command: 'claude' };
    }

    if (kind === 'codex') {
      return { args: [], command: 'codex' };
    }

    if (kind === 'genfeed') {
      return { args: [], command: 'gf' };
    }

    if (process.platform === 'win32') {
      return { args: [], command: 'powershell.exe' };
    }

    return { args: ['-l'], command: process.env.SHELL ?? '/bin/zsh' };
  }

  private isMissingCommandError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const errnoError = error as NodeJS.ErrnoException;
    return (
      errnoError.code === 'ENOENT' ||
      errnoError.message?.includes('ENOENT') === true
    );
  }

  private resolveWorkingDirectory(requestedCwd: string | undefined): string {
    const configuredCwd =
      typeof requestedCwd === 'string' && requestedCwd.trim()
        ? requestedCwd
        : this.configService.get('GENFEED_TERMINAL_CWD');

    if (typeof configuredCwd !== 'string' || !configuredCwd.trim()) {
      return os.homedir();
    }

    if (!path.isAbsolute(configuredCwd)) {
      this.logger.warn(`Ignoring non-absolute terminal cwd: ${configuredCwd}`);
      return os.homedir();
    }

    const normalizedCwd = path.resolve(configuredCwd);
    try {
      if (fs.statSync(normalizedCwd).isDirectory()) {
        return normalizedCwd;
      }
    } catch {
      this.logger.warn(`Ignoring unavailable terminal cwd: ${configuredCwd}`);
      return os.homedir();
    }

    this.logger.warn(`Ignoring non-directory terminal cwd: ${configuredCwd}`);
    return os.homedir();
  }

  /** Appends a chunk to the scrollback ring, evicting oldest chunks as needed. */
  private appendScrollback(buffer: ScrollbackBuffer, data: string): void {
    const chunk = Buffer.from(data, 'utf8');
    buffer.chunks.push(chunk);
    buffer.totalBytes += chunk.byteLength;

    // Evict oldest chunks until we're within the budget.
    while (buffer.totalBytes > MAX_BUFFER_BYTES && buffer.chunks.length > 0) {
      const evicted = buffer.chunks.shift();
      if (evicted) {
        buffer.totalBytes -= evicted.byteLength;
      }
    }
  }

  /** Concatenates all scrollback chunks into a single UTF-8 string. */
  private drainScrollback(buffer: ScrollbackBuffer): string {
    if (buffer.chunks.length === 0) {
      return '';
    }

    return Buffer.concat(buffer.chunks).toString('utf8');
  }

  private toDto(
    sessionId: string,
    session: TerminalProcess,
  ): TerminalSessionDto {
    return {
      command: session.command,
      createdAt: session.createdAt,
      cwd: session.cwd,
      id: sessionId,
      kind: session.kind,
      pid: session.pty.pid,
      threadId: session.threadId,
    };
  }
}
