'use client';

import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { FitAddon } from '@xterm/addon-fit';
import type {
  IDisposable as XtermDisposable,
  Terminal as XtermTerminal,
} from '@xterm/xterm';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';

type TerminalSessionKind = 'claude' | 'codex' | 'genfeed' | 'shell';

interface TerminalSession {
  command: string;
  createdAt: string;
  cwd: string;
  id: string;
  kind: TerminalSessionKind;
  pid: number;
}

interface TerminalCreatePayload {
  cols?: number;
  cwd?: string;
  kind?: TerminalSessionKind;
  rows?: number;
}

interface TerminalDataPayload {
  data: string;
  sessionId: string;
}

interface TerminalExitPayload {
  exitCode?: number;
  sessionId: string;
  signal?: number;
}

interface AgentCliTerminalProps {
  apiService: AgentApiService;
}

const TERMINAL_COLS = 120;
const TERMINAL_ROWS = 32;
const TERMINAL_CWD_STORAGE_KEY = 'genfeed:terminal:cwd';

const TERMINAL_PRESETS: Array<{
  kind: TerminalSessionKind;
  label: string;
}> = [
  { kind: 'shell', label: 'Shell' },
  { kind: 'genfeed', label: 'Genfeed' },
  { kind: 'claude', label: 'Claude' },
  { kind: 'codex', label: 'Codex' },
];

function isHostedCloud(): boolean {
  return process.env.NEXT_PUBLIC_GENFEED_CLOUD === 'true';
}

function resolveTerminalEndpoint(): string {
  return EnvironmentService.wsEndpoint.replace(/\/$/, '');
}

function resolveClientWorkspaceCwd(): string | undefined {
  const configuredCwd = process.env.NEXT_PUBLIC_GENFEED_TERMINAL_CWD?.trim();
  return configuredCwd || undefined;
}

function readPersistedTerminalCwd(): string {
  if (typeof window === 'undefined') {
    return resolveClientWorkspaceCwd() ?? '';
  }

  try {
    return (
      window.localStorage.getItem(TERMINAL_CWD_STORAGE_KEY) ??
      resolveClientWorkspaceCwd() ??
      ''
    );
  } catch {
    return resolveClientWorkspaceCwd() ?? '';
  }
}

function persistTerminalCwd(cwd: string): void {
  if (
    typeof window === 'undefined' ||
    typeof window.localStorage?.setItem !== 'function'
  ) {
    return;
  }

  try {
    if (cwd) {
      window.localStorage.setItem(TERMINAL_CWD_STORAGE_KEY, cwd);
    } else {
      window.localStorage.removeItem(TERMINAL_CWD_STORAGE_KEY);
    }
  } catch {
    // Ignore persistence failures in constrained browser environments.
  }
}

export function AgentCliTerminal({
  apiService: _apiService,
}: AgentCliTerminalProps): ReactElement {
  const [activeKind, setActiveKind] = useState<TerminalSessionKind>('shell');
  const [cwdInput, setCwdInput] = useState(readPersistedTerminalCwd);
  const [status, setStatus] = useState('connecting to local terminal...');
  const cwdRef = useRef(cwdInput);
  const dataDisposableRef = useRef<XtermDisposable | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);

  const fitAndSyncSize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;

    if (!terminal || !fitAddon) {
      return;
    }

    try {
      fitAddon.fit();
    } catch {
      return;
    }

    const currentSession = sessionRef.current;
    const socket = socketRef.current;
    if (currentSession && socket?.connected) {
      socket.emit('terminal:resize', {
        cols: terminal.cols,
        rows: terminal.rows,
        sessionId: currentSession.id,
      });
    }
  }, []);

  const startSession = useCallback(
    (kind: TerminalSessionKind) => {
      const socket = socketRef.current;
      const previousSession = sessionRef.current;
      const terminal = terminalRef.current;

      if (!socket?.connected) {
        setStatus('local terminal gateway is not connected');
        terminal?.writeln('Local terminal gateway is not connected.');
        return;
      }

      if (previousSession) {
        socket.emit('terminal:kill', { sessionId: previousSession.id });
      }

      setActiveKind(kind);
      setStatus(`starting ${kind}...`);
      sessionRef.current = null;
      terminal?.reset();
      terminal?.writeln(`Starting ${kind}...`);

      fitAndSyncSize();
      socket.emit('terminal:create', {
        cols: terminal?.cols ?? TERMINAL_COLS,
        cwd: cwdRef.current.trim() || undefined,
        kind,
        rows: terminal?.rows ?? TERMINAL_ROWS,
      } satisfies TerminalCreatePayload);
    },
    [fitAndSyncSize],
  );

  const handleCwdSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextCwd = cwdInput.trim();
      cwdRef.current = nextCwd;
      persistTerminalCwd(nextCwd);
      startSession(activeKind);
    },
    [activeKind, cwdInput, startSession],
  );

  useEffect(() => {
    if (isHostedCloud()) {
      setStatus('terminal unavailable on hosted cloud');
      return undefined;
    }

    let disposed = false;

    async function bootTerminal(): Promise<void> {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);

      if (disposed || !terminalContainerRef.current) {
        return;
      }

      const terminal = new Terminal({
        allowProposedApi: false,
        convertEol: true,
        cursorBlink: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        letterSpacing: 0,
        lineHeight: 1.25,
        rows: TERMINAL_ROWS,
        scrollback: 4000,
        theme: {
          background: '#050806',
          black: '#0b0f0d',
          blue: '#7aa2ff',
          brightBlack: '#4f5f58',
          brightBlue: '#9cb8ff',
          brightCyan: '#7fe7e0',
          brightGreen: '#74f2a8',
          brightMagenta: '#d9a5ff',
          brightRed: '#ff8f8f',
          brightWhite: '#f2fff7',
          brightYellow: '#ffe08a',
          cursor: '#7cffb2',
          cyan: '#5bd8d2',
          foreground: '#d6eadf',
          green: '#45d483',
          magenta: '#c58cff',
          red: '#ff6b6b',
          selectionBackground: '#244536',
          white: '#d6eadf',
          yellow: '#f5c451',
        },
      });
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(terminalContainerRef.current);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      dataDisposableRef.current = terminal.onData((data) => {
        const socket = socketRef.current;
        const currentSession = sessionRef.current;

        if (!socket || !currentSession) {
          return;
        }

        socket.emit('terminal:write', {
          data,
          sessionId: currentSession.id,
        });
      });

      requestAnimationFrame(() => {
        fitAndSyncSize();
        terminal.focus();
      });

      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => fitAndSyncSize());
        resizeObserver.observe(terminalContainerRef.current);
        resizeObserverRef.current = resizeObserver;
      }

      terminal.writeln('Connecting to local terminal gateway...');

      const socket = io(`${resolveTerminalEndpoint()}/terminal`, {
        reconnectionAttempts: 3,
        timeout: 8_000,
        transports: ['websocket'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setStatus('connected');
        startSession('shell');
      });

      socket.on('connect_error', (error) => {
        setStatus('local terminal unavailable');
        terminal.writeln(
          `Could not connect to the local terminal gateway: ${error.message}`,
        );
      });

      socket.on('terminal:created', (nextSession: TerminalSession) => {
        sessionRef.current = nextSession;
        setStatus(`${nextSession.command} - ${nextSession.cwd}`);
        fitAndSyncSize();
        terminal.focus();
      });

      socket.on('terminal:data', (payload: TerminalDataPayload) => {
        if (payload.sessionId !== sessionRef.current?.id) {
          return;
        }

        terminal.write(payload.data);
      });

      socket.on('terminal:error', (payload: { message?: string }) => {
        const message = payload.message || 'Local terminal error.';
        setStatus(message);
        terminal.writeln(message);
      });

      socket.on('terminal:exit', (payload: TerminalExitPayload) => {
        if (payload.sessionId !== sessionRef.current?.id) {
          return;
        }

        setStatus(`exited with code ${payload.exitCode ?? 0}`);
        terminal.writeln(`\r\n[process exited: ${payload.exitCode ?? 0}]`);
        sessionRef.current = null;
      });
    }

    bootTerminal().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Could not load terminal UI.';
      setStatus(message);
    });

    return () => {
      disposed = true;
      const currentSession = sessionRef.current;
      const socket = socketRef.current;

      if (currentSession) {
        socket?.emit('terminal:kill', { sessionId: currentSession.id });
      }

      resizeObserverRef.current?.disconnect();
      dataDisposableRef.current?.dispose();
      terminalRef.current?.dispose();
      socket?.disconnect();
      resizeObserverRef.current = null;
      dataDisposableRef.current = null;
      fitAddonRef.current = null;
      terminalRef.current = null;
      socketRef.current = null;
      sessionRef.current = null;
    };
  }, [fitAndSyncSize, startSession]);

  return (
    <div
      className="flex h-full flex-col font-mono text-[13px] leading-relaxed"
      data-testid="agent-cli-terminal"
      onClick={() => terminalRef.current?.focus()}
      role="presentation"
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
        <span className="shrink-0 font-semibold text-emerald-400">
          genfeed terminal
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/42">
          {status}
        </span>
        <form
          className="hidden min-w-[9rem] max-w-[18rem] flex-1 items-center gap-1 md:flex"
          onSubmit={handleCwdSubmit}
        >
          <Input
            aria-label="Terminal working directory"
            className="h-6 min-w-0 flex-1 rounded border border-border/50 bg-background/30 px-2 text-[11px] text-foreground/70 outline-none transition-colors placeholder:text-foreground/28 focus:border-emerald-300/50"
            onChange={(event) => {
              setCwdInput(event.target.value);
              cwdRef.current = event.target.value;
            }}
            onBlur={() => {
              const nextCwd = cwdInput.trim();
              cwdRef.current = nextCwd;
              persistTerminalCwd(nextCwd);
            }}
            placeholder="$HOME or /path/to/project"
            spellCheck={false}
            value={cwdInput}
          />
          <Button
            className="h-6 rounded border border-border/60 px-2 text-[11px] text-foreground/55 transition-colors hover:border-emerald-300/50 hover:text-emerald-200"
            label="cwd"
            type="submit"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        </form>
        <div className="flex shrink-0 items-center gap-1">
          {TERMINAL_PRESETS.map((preset) => (
            <Button
              key={preset.kind}
              className={cn(
                'h-6 rounded border border-border/60 px-2 text-[11px] text-foreground/55 transition-colors hover:border-emerald-300/50 hover:text-emerald-200',
                activeKind === preset.kind &&
                  'border-emerald-300/50 text-emerald-200',
              )}
              onClick={(event) => {
                event.stopPropagation();
                startSession(preset.kind);
              }}
              label={preset.label}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            />
          ))}
        </div>
      </div>

      <div
        ref={terminalContainerRef}
        aria-label="Genfeed terminal"
        className="min-h-0 flex-1 overflow-hidden bg-[#050806] px-3 py-2 text-[13px] text-foreground/78 outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/35 [&_.xterm-screen]:outline-none [&_.xterm-viewport]:overflow-y-auto"
        role="textbox"
        tabIndex={0}
      />
    </div>
  );
}
