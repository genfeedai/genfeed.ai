import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type {
  DesktopTerminalKind,
  IDesktopTerminalCreateOptions,
  IDesktopTerminalDataEvent,
  IDesktopTerminalExitEvent,
  IDesktopTerminalSession,
} from '@genfeedai/contracts/desktop';
import type { IDisposable, IPty } from 'node-pty';
import { spawn } from 'node-pty';
import { resolveGenfeedCliLaunch } from './genfeed-cli-launch.util';

interface DesktopTerminalProcess {
  dataSubscription: IDisposable;
  exitSubscription: IDisposable;
  pty: IPty;
}

type TerminalDataCallback = (event: IDesktopTerminalDataEvent) => void;
type TerminalExitCallback = (event: IDesktopTerminalExitEvent) => void;

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
/** Keeps one argv entry far below the OS argument limit. */
const MAX_CLAUDE_PROMPT_LENGTH = 100_000;

const TERMINAL_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

const nodeRequire = createRequire(import.meta.url);

/**
 * Local PTY sessions (shell, Genfeed CLI, Claude Code, Codex) for the agent
 * panel terminal. They only need this machine.
 */
export class DesktopTerminalService {
  private readonly sessions = new Map<string, DesktopTerminalProcess>();

  /**
   * @param getGenfeedCliEnvironment Sign-in for the Genfeed CLI: the Desktop
   * session's key and server, so `gf` does not ask for a second browser login.
   * Only a Genfeed CLI session receives it, never a shell or an agent CLI.
   */
  constructor(
    private readonly getGenfeedCliEnvironment: () => Record<
      string,
      string
    > | null = () => null,
  ) {}

  async createSession(
    options: IDesktopTerminalCreateOptions | undefined,
    onData: TerminalDataCallback,
    onExit: TerminalExitCallback,
  ): Promise<IDesktopTerminalSession> {
    const kind = options?.kind ?? 'shell';
    const cwd = this.resolveWorkingDirectory(options?.cwd);
    const { args, command } = this.resolveCommand(kind, options?.prompt);
    const sessionId = randomUUID();

    this.ensurePtyHelperExecutable();

    const pty = spawn(command, args, {
      cols: options?.cols ?? DEFAULT_COLS,
      cwd,
      env: this.buildEnvironment(
        kind === 'genfeed' ? this.getGenfeedCliEnvironment() : null,
      ),
      name: 'xterm-256color',
      rows: options?.rows ?? DEFAULT_ROWS,
    });

    const dataSubscription = pty.onData((data) => {
      onData({ data, sessionId });
    });
    const exitSubscription = pty.onExit(({ exitCode, signal }) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.disposeSession(session);
        this.sessions.delete(sessionId);
      }
      onExit({ exitCode, sessionId, signal });
    });

    this.sessions.set(sessionId, {
      dataSubscription,
      exitSubscription,
      pty,
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

  killSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    this.disposeSession(session);
    session.pty.kill();
    this.sessions.delete(sessionId);
  }

  killAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.killSession(sessionId);
    }
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.pty.resize(cols, rows);
  }

  writeSession(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  private disposeSession(session: DesktopTerminalProcess): void {
    session.dataSubscription.dispose();
    session.exitSubscription.dispose();
  }

  private buildEnvironment(
    extra: Record<string, string> | null,
  ): NodeJS.ProcessEnv {
    const existingPath = process.env.PATH ?? '';
    const nextPath = [
      ...TERMINAL_PATHS,
      ...existingPath.split(':').filter(Boolean),
    ].join(':');

    return {
      ...process.env,
      ...extra,
      COLORTERM: process.env.COLORTERM ?? 'truecolor',
      PATH: nextPath,
      TERM: 'xterm-256color',
    };
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

  private resolveWorkingDirectory(requestedCwd: string | undefined): string {
    const cwd = requestedCwd?.trim();
    if (cwd) {
      const expanded =
        cwd === '~' || cwd.startsWith('~/')
          ? path.join(os.homedir(), cwd.slice(1))
          : cwd;

      if (path.isAbsolute(expanded)) {
        try {
          if (fs.statSync(expanded).isDirectory()) {
            return expanded;
          }
        } catch {
          // Fall back to the home directory below.
        }
      }
    }

    return os.homedir();
  }

  private resolveCommand(
    kind: DesktopTerminalKind,
    prompt?: string,
  ): {
    args: string[];
    command: string;
  } {
    if (kind === 'claude') {
      // No permission flag: Claude Code asks before it runs a command or
      // writes a file. The prompt is an argv entry, never shell text.
      return {
        args: prompt ? [prompt.slice(0, MAX_CLAUDE_PROMPT_LENGTH)] : [],
        command: 'claude',
      };
    }

    if (kind === 'codex') {
      return { args: [], command: 'codex' };
    }

    if (kind === 'genfeed') {
      return resolveGenfeedCliLaunch(process.platform);
    }

    if (process.platform === 'win32') {
      return { args: [], command: 'powershell.exe' };
    }

    return { args: ['-l'], command: process.env.SHELL ?? '/bin/zsh' };
  }
}
