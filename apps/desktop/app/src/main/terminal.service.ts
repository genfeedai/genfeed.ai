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
} from '@genfeedai/desktop-contracts';
import type { IDisposable, IPty } from 'node-pty';
import { spawn } from 'node-pty';
import type { DesktopWorkspaceService } from './workspace.service';

interface DesktopTerminalProcess {
  dataSubscription: IDisposable;
  exitSubscription: IDisposable;
  pty: IPty;
}

type TerminalDataCallback = (event: IDesktopTerminalDataEvent) => void;
type TerminalExitCallback = (event: IDesktopTerminalExitEvent) => void;

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

const TERMINAL_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

const nodeRequire = createRequire(__filename);

export class DesktopTerminalService {
  private readonly sessions = new Map<string, DesktopTerminalProcess>();

  constructor(private readonly workspaceService: DesktopWorkspaceService) {}

  async createSession(
    options: IDesktopTerminalCreateOptions | undefined,
    onData: TerminalDataCallback,
    onExit: TerminalExitCallback,
  ): Promise<IDesktopTerminalSession> {
    const kind = options?.kind ?? 'shell';
    const cwd = await this.resolveWorkingDirectory(options?.workspaceId);
    const { args, command } = this.resolveCommand(kind);
    const sessionId = randomUUID();

    this.ensurePtyHelperExecutable();

    const pty = spawn(command, args, {
      cols: options?.cols ?? DEFAULT_COLS,
      cwd,
      env: this.buildEnvironment(),
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

  private async resolveWorkingDirectory(
    workspaceId: string | null | undefined,
  ): Promise<string> {
    if (!workspaceId) {
      return os.homedir();
    }

    const workspace = await this.workspaceService.getWorkspace(workspaceId);
    return workspace.path;
  }

  private resolveCommand(kind: DesktopTerminalKind): {
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
}
