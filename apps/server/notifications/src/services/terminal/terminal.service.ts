import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import type { IDisposable, IPty } from 'node-pty';
import { spawn } from 'node-pty';
import type {
  TerminalCreatePayload,
  TerminalDataPayload,
  TerminalExitPayload,
  TerminalSessionDto,
  TerminalSessionKind,
} from './terminal.types';

interface TerminalProcess {
  dataSubscription: IDisposable;
  exitSubscription: IDisposable;
  ownerSocketId: string;
  pty: IPty;
}

interface TerminalCallbacks {
  onData: (payload: TerminalDataPayload) => void;
  onExit: (payload: TerminalExitPayload) => void;
}

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

const nodeRequire = createRequire(__filename);

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);
  private readonly sessions = new Map<string, TerminalProcess>();

  constructor(private readonly configService: ConfigService) {}

  createSession(
    ownerSocketId: string,
    payload: TerminalCreatePayload | undefined,
    callbacks: TerminalCallbacks,
  ): TerminalSessionDto {
    this.assertAvailable();

    const kind = this.normalizeKind(payload?.kind);
    const cwd = this.resolveWorkingDirectory(payload?.cwd);
    const { args, command } = this.resolveCommand(kind);
    const sessionId = randomUUID();

    this.ensurePtyHelperExecutable();

    let pty: IPty;
    try {
      pty = spawn(command, args, {
        cols: this.clampDimension(payload?.cols, DEFAULT_COLS, MAX_COLS),
        cwd,
        env: this.buildEnvironment(),
        name: 'xterm-256color',
        rows: this.clampDimension(payload?.rows, DEFAULT_ROWS, MAX_ROWS),
      });
    } catch (error) {
      throw new Error(this.formatSpawnError(kind, command, error));
    }

    const dataSubscription = pty.onData((data) => {
      callbacks.onData({ data, sessionId });
    });
    const exitSubscription = pty.onExit(({ exitCode, signal }) => {
      this.sessions.delete(sessionId);
      callbacks.onExit({ exitCode, sessionId, signal });
    });

    this.sessions.set(sessionId, {
      dataSubscription,
      exitSubscription,
      ownerSocketId,
      pty,
    });

    this.logger.log(`Started local terminal session`, {
      command,
      cwd,
      kind,
      ownerSocketId,
      sessionId,
    });

    return {
      command,
      createdAt: new Date().toISOString(),
      cwd,
      id: sessionId,
      kind,
      pid: pty.pid,
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

  killAllForSocket(ownerSocketId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.ownerSocketId === ownerSocketId) {
        this.killSession(ownerSocketId, sessionId);
      }
    }
  }

  killSession(ownerSocketId: string, sessionId: string): void {
    const session = this.getOwnedSession(ownerSocketId, sessionId);

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
    sessionId: string,
    cols: number,
    rows: number,
  ): void {
    this.getOwnedSession(ownerSocketId, sessionId)?.pty.resize(
      this.clampDimension(cols, DEFAULT_COLS, MAX_COLS),
      this.clampDimension(rows, DEFAULT_ROWS, MAX_ROWS),
    );
  }

  writeSession(ownerSocketId: string, sessionId: string, data: string): void {
    this.getOwnedSession(ownerSocketId, sessionId)?.pty.write(data);
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

  private ensurePtyHelperExecutable(): void {
    if (process.platform === 'win32') {
      return;
    }

    const packagePath = nodeRequire.resolve('node-pty/package.json');
    const helperPath = path.join(
      path.dirname(packagePath),
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper',
    );

    if (!fs.existsSync(helperPath)) {
      return;
    }

    const stat = fs.statSync(helperPath);
    if ((stat.mode & 0o111) !== 0) {
      return;
    }

    fs.chmodSync(helperPath, stat.mode | 0o755);
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

  private getOwnedSession(
    ownerSocketId: string,
    sessionId: string,
  ): TerminalProcess | null {
    const session = this.sessions.get(sessionId);

    if (!session || session.ownerSocketId !== ownerSocketId) {
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
}
