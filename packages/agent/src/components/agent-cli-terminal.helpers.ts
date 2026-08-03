import type {
  TerminalSessionDto,
  TerminalSessionKind,
} from '@genfeedai/agent/stores/agent-chat.store';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TERMINAL_COLS = 120;
export const TERMINAL_ROWS = 32;
export const TERMINAL_CWD_STORAGE_KEY = 'genfeed:terminal:cwd';

export const TERMINAL_PRESETS: Array<{
  description: string;
  kind: TerminalSessionKind;
  label: string;
}> = [
  { description: 'Open your local login shell', kind: 'shell', label: 'Shell' },
  { description: 'Run the Genfeed CLI', kind: 'genfeed', label: 'Genfeed CLI' },
  { description: 'Open the Claude CLI', kind: 'claude', label: 'Claude CLI' },
  { description: 'Open the Codex CLI', kind: 'codex', label: 'Codex CLI' },
];

export const TERMINAL_CONTROL_CLASS =
  'inline-flex h-7 shrink-0 items-center rounded-md border border-border/60 bg-background/30 px-2 text-[11px] leading-none text-foreground/58 transition-colors hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground/84';
export const TERMINAL_ICON_CONTROL_CLASS =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/30 text-foreground/50 transition-colors hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground/84';

// ---------------------------------------------------------------------------
// Payload types (matching backend TerminalSessionDto + wire events)
// ---------------------------------------------------------------------------

export interface TerminalCreatePayload {
  cols?: number;
  cwd?: string;
  kind?: TerminalSessionKind;
  rows?: number;
  threadId?: string;
}

export interface TerminalDataPayload {
  data: string;
  sessionId: string;
}

export interface TerminalExitPayload {
  exitCode?: number;
  sessionId: string;
  signal?: number;
}

// ---------------------------------------------------------------------------
// Public controller shape — keep containerRef compatible with AgentPanel.tsx
// ---------------------------------------------------------------------------

export interface AgentCliTerminalController {
  activeKind: TerminalSessionKind;
  activeSessionId: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  cwdInput: string;
  isSearchOpen: boolean;
  searchQuery: string;
  /** Sessions for the current thread key (multi-tab, T6). */
  sessions: TerminalSessionDto[];
  persistCwdInput: () => void;
  setCwdInput: (value: string) => void;
  setSearchQuery: (value: string) => void;
  startSession: (kind: TerminalSessionKind) => void;
  status: string;
  submitCwd: () => void;
  switchSession: (sessionId: string) => void;
  killSession: (sessionId: string) => void;
  toggleSearch: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveTerminalEndpoint(): string {
  return EnvironmentService.wsEndpoint.replace(/\/$/, '');
}

export function resolveClientWorkspaceCwd(): string | undefined {
  const configuredCwd = process.env.NEXT_PUBLIC_GENFEED_TERMINAL_CWD?.trim();
  return configuredCwd || undefined;
}

export function readPersistedTerminalCwd(): string {
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

export function persistTerminalCwd(cwd: string): void {
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

export function resolveThreadKey(activeThreadId: string | null): string {
  return activeThreadId ?? 'global';
}

// ---------------------------------------------------------------------------
// Socket event wiring
// ---------------------------------------------------------------------------

export function attachTerminalSocketHandlers({
  fitAndSyncSize,
  onSessionCreated,
  onSessionsListed,
  onSessionAttached,
  setStatus,
  socket,
  terminal,
  sessionIdRef,
}: {
  fitAndSyncSize: () => void;
  onSessionCreated: (session: TerminalSessionDto) => void;
  onSessionsListed: (sessions: TerminalSessionDto[]) => void;
  onSessionAttached: (session: TerminalSessionDto) => void;
  setStatus: (status: string) => void;
  socket: Socket;
  terminal: XtermTerminal;
  sessionIdRef: { current: string | null };
}): () => void {
  const handleConnectError = (error: Error) => {
    setStatus('local terminal unavailable');
    terminal.writeln(
      `Could not connect to the local terminal gateway: ${error.message}`,
    );
  };

  const handleTerminalCreated = (nextSession: TerminalSessionDto) => {
    sessionIdRef.current = nextSession.id;
    setStatus(`${nextSession.kind} - ${nextSession.cwd}`);
    onSessionCreated(nextSession);
    fitAndSyncSize();
    terminal.focus();
  };

  const handleTerminalSessions = (sessions: TerminalSessionDto[]) => {
    onSessionsListed(sessions);
  };

  const handleTerminalAttached = (session: TerminalSessionDto) => {
    sessionIdRef.current = session.id;
    setStatus(`${session.kind} - ${session.cwd}`);
    onSessionAttached(session);
    terminal.clear();
    fitAndSyncSize();
    terminal.focus();
  };

  const handleTerminalData = (payload: TerminalDataPayload) => {
    if (payload.sessionId !== sessionIdRef.current) {
      return;
    }

    terminal.write(payload.data);
  };

  const handleTerminalError = (payload: { message?: string }) => {
    const message = payload.message || 'Local terminal error.';
    setStatus(message);
    terminal.writeln(message);
  };

  const handleTerminalExit = (payload: TerminalExitPayload) => {
    if (payload.sessionId !== sessionIdRef.current) {
      return;
    }

    setStatus(`exited with code ${payload.exitCode ?? 0}`);
    terminal.writeln(`\r\n[process exited: ${payload.exitCode ?? 0}]`);
    sessionIdRef.current = null;
  };

  socket.on('connect_error', handleConnectError);
  socket.on('terminal:created', handleTerminalCreated);
  socket.on('terminal:sessions', handleTerminalSessions);
  socket.on('terminal:attached', handleTerminalAttached);
  socket.on('terminal:data', handleTerminalData);
  socket.on('terminal:error', handleTerminalError);
  socket.on('terminal:exit', handleTerminalExit);

  return () => {
    socket.off('connect_error', handleConnectError);
    socket.off('terminal:created', handleTerminalCreated);
    socket.off('terminal:sessions', handleTerminalSessions);
    socket.off('terminal:attached', handleTerminalAttached);
    socket.off('terminal:data', handleTerminalData);
    socket.off('terminal:error', handleTerminalError);
    socket.off('terminal:exit', handleTerminalExit);
  };
}
