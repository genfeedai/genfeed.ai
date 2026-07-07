'use client';

import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  type TerminalSessionDto,
  type TerminalSessionKind,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import type {
  IDisposable as XtermDisposable,
  Terminal as XtermTerminal,
} from '@xterm/xterm';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMINAL_COLS = 120;
const TERMINAL_ROWS = 32;
const TERMINAL_CWD_STORAGE_KEY = 'genfeed:terminal:cwd';

const TERMINAL_PRESETS: Array<{
  description: string;
  kind: TerminalSessionKind;
  label: string;
}> = [
  { description: 'Open your local login shell', kind: 'shell', label: 'Shell' },
  { description: 'Run the Genfeed CLI', kind: 'genfeed', label: 'Genfeed CLI' },
  { description: 'Open the Claude CLI', kind: 'claude', label: 'Claude CLI' },
  { description: 'Open the Codex CLI', kind: 'codex', label: 'Codex CLI' },
];

const TERMINAL_CONTROL_CLASS =
  'inline-flex h-7 shrink-0 items-center rounded-md border border-border/60 bg-background/30 px-2 text-[11px] leading-none text-foreground/58 transition-colors hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground/84';
const TERMINAL_ICON_CONTROL_CLASS =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/30 text-foreground/50 transition-colors hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground/84';

// ---------------------------------------------------------------------------
// Payload types (matching backend TerminalSessionDto + wire events)
// ---------------------------------------------------------------------------

interface TerminalCreatePayload {
  cols?: number;
  cwd?: string;
  kind?: TerminalSessionKind;
  rows?: number;
  threadId?: string;
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

function resolveThreadKey(activeThreadId: string | null): string {
  return activeThreadId ?? 'global';
}

// ---------------------------------------------------------------------------
// Socket event wiring
// ---------------------------------------------------------------------------

function attachTerminalSocketHandlers({
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentCliTerminal(
  apiService: AgentApiService,
): AgentCliTerminalController {
  const hostedCloud = isHostedCloud();
  const [activeKind, setActiveKind] = useState<TerminalSessionKind>('shell');
  const [cwdInput, setCwdInputState] = useState(readPersistedTerminalCwd);
  const [status, setStatus] = useState(() =>
    hostedCloud
      ? 'terminal unavailable on hosted cloud'
      : 'connecting to local terminal...',
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQueryState] = useState('');

  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const terminalSessionsByThread = useAgentChatStore(
    (s) => s.terminalSessionsByThread,
  );
  const activeTerminalSessionByThread = useAgentChatStore(
    (s) => s.activeTerminalSessionByThread,
  );
  const addTerminalSession = useAgentChatStore((s) => s.addTerminalSession);
  const removeTerminalSession = useAgentChatStore(
    (s) => s.removeTerminalSession,
  );
  const setTerminalSessionsByThread = useAgentChatStore(
    (s) => s.setTerminalSessionsByThread,
  );
  const setActiveTerminalSession = useAgentChatStore(
    (s) => s.setActiveTerminalSession,
  );

  const cwdRef = useRef(cwdInput);
  const dataDisposableRef = useRef<XtermDisposable | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);

  // Keep thread ref in sync for use inside callbacks
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const threadKey = resolveThreadKey(activeThreadId);
  const sessions = terminalSessionsByThread.get(threadKey) ?? [];
  const activeSessionId =
    activeTerminalSessionByThread[threadKey] ?? sessions[0]?.id ?? null;

  const setCwdInput = useCallback((value: string) => {
    setCwdInputState(value);
    cwdRef.current = value;
  }, []);

  const syncResolvedSession = useCallback((session: TerminalSessionDto) => {
    setActiveKind(session.kind);

    if (!session.cwd) {
      return;
    }

    cwdRef.current = session.cwd;
    setCwdInputState(session.cwd);
    persistTerminalCwd(session.cwd);
  }, []);

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

    const socket = socketRef.current;
    if (sessionIdRef.current && socket?.connected) {
      socket.emit('terminal:resize', {
        cols: terminal.cols,
        rows: terminal.rows,
        sessionId: sessionIdRef.current,
      });
    }
  }, []);

  // Spawn a brand-new session for the current thread + kind
  const startSession = useCallback(
    (kind: TerminalSessionKind) => {
      const socket = socketRef.current;
      const terminal = terminalRef.current;

      if (!socket?.connected) {
        setStatus('local terminal gateway is not connected');
        terminal?.writeln('Local terminal gateway is not connected.');
        return;
      }

      setActiveKind(kind);
      setStatus(`starting ${kind}...`);
      terminal?.reset();
      terminal?.writeln(`Starting ${kind}...`);
      fitAndSyncSize();

      socket.emit('terminal:create', {
        cols: terminal?.cols ?? TERMINAL_COLS,
        cwd: cwdRef.current.trim() || undefined,
        kind,
        rows: terminal?.rows ?? TERMINAL_ROWS,
        threadId: activeThreadIdRef.current ?? undefined,
      } satisfies TerminalCreatePayload);
    },
    [fitAndSyncSize],
  );

  // Attach to an existing session — clears xterm, unsubscribes old data,
  // then server flushes scrollback via terminal:data events before live stream
  const switchSession = useCallback(
    (targetSessionId: string) => {
      const socket = socketRef.current;
      const terminal = terminalRef.current;
      const key = resolveThreadKey(activeThreadIdRef.current);

      if (!socket?.connected || !terminal) {
        return;
      }

      setActiveTerminalSession(key, targetSessionId);
      sessionIdRef.current = targetSessionId;
      terminal.clear();
      setStatus('attaching...');

      socket.emit('terminal:attach', { sessionId: targetSessionId });
    },
    [setActiveTerminalSession],
  );

  // Kill a session tab (T6)
  const killSession = useCallback(
    (targetSessionId: string) => {
      const socket = socketRef.current;
      const key = resolveThreadKey(activeThreadIdRef.current);

      if (socket?.connected) {
        socket.emit('terminal:kill', { sessionId: targetSessionId });
      }

      removeTerminalSession(key, targetSessionId);

      // If we just killed the active session, stay in sync
      if (sessionIdRef.current === targetSessionId) {
        sessionIdRef.current = null;
        terminalRef.current?.clear();
      }
    },
    [removeTerminalSession],
  );

  const submitCwd = useCallback(() => {
    const nextCwd = cwdRef.current.trim();
    cwdRef.current = nextCwd;
    setCwdInputState(nextCwd);
    persistTerminalCwd(nextCwd);
    startSession(activeKind);
  }, [activeKind, startSession]);

  const persistCwdInput = useCallback(() => {
    const nextCwd = cwdRef.current.trim();
    cwdRef.current = nextCwd;
    setCwdInputState(nextCwd);
    persistTerminalCwd(nextCwd);
  }, []);

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    const searchAddon = searchAddonRef.current;
    if (!searchAddon) {
      return;
    }

    if (query) {
      searchAddon.findNext(query, { incremental: true });
    }
  }, []);

  // T1: React to activeThreadId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return;
    }

    const key = resolveThreadKey(activeThreadId);
    const existingSessions = terminalSessionsByThread.get(key) ?? [];
    const targetId =
      activeTerminalSessionByThread[key] ?? existingSessions[0]?.id;

    if (targetId) {
      // Existing session for this thread — attach
      sessionIdRef.current = targetId;
      terminalRef.current?.clear();
      setStatus('attaching...');
      socket.emit('terminal:attach', { sessionId: targetId });
    } else {
      // No session yet for new thread — spawn one
      startSession('shell');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // Boot effect — mounts xterm, establishes socket, lists existing sessions
  useEffect(() => {
    if (hostedCloud) {
      return undefined;
    }

    let disposed = false;
    let detachSocketHandlers: (() => void) | null = null;
    let detachConnectHandler: (() => void) | null = null;

    async function bootTerminal(): Promise<void> {
      const [{ Terminal }, { FitAddon }, { SearchAddon }, { WebLinksAddon }] =
        await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-search'),
          import('@xterm/addon-web-links'),
        ]);

      if (disposed || !containerRef.current) {
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
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(containerRef.current);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      dataDisposableRef.current = terminal.onData((data) => {
        const socket = socketRef.current;
        if (!socket || !sessionIdRef.current) {
          return;
        }

        socket.emit('terminal:write', {
          data,
          sessionId: sessionIdRef.current,
        });
      });

      requestAnimationFrame(() => {
        fitAndSyncSize();
        terminal.focus();
      });

      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => fitAndSyncSize());
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;
      }

      terminal.writeln('Connecting to local terminal gateway...');

      const token = await resolveAuthToken(
        (options) => apiService.getToken(options),
        { forceRefresh: true },
      );
      if (!token) {
        terminal.writeln('Using browser session cookie for terminal auth...');
        setStatus('authenticating with session cookie...');
      }

      const socket = io(`${resolveTerminalEndpoint()}/terminal`, {
        ...(token
          ? {
              auth: { token },
              extraHeaders: { Authorization: `Bearer ${token}` },
            }
          : { auth: {} }),
        reconnectionAttempts: 3,
        timeout: 8_000,
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });
      socketRef.current = socket;

      const handleConnect = () => {
        setStatus('connected');

        // T2: request existing sessions for rehydration
        socket.emit('terminal:list');
      };
      socket.on('connect', handleConnect);
      detachConnectHandler = () => socket.off('connect', handleConnect);

      detachSocketHandlers = attachTerminalSocketHandlers({
        fitAndSyncSize,
        sessionIdRef,
        onSessionCreated: (session) => {
          const key = resolveThreadKey(activeThreadIdRef.current);
          syncResolvedSession(session);
          addTerminalSession(key, session);
          sessionIdRef.current = session.id;
          setActiveTerminalSession(key, session.id);
        },
        onSessionsListed: (sessions) => {
          // T2: populate store from server list, then prune stale local entries
          const next = new Map<string, TerminalSessionDto[]>();
          for (const session of sessions) {
            const key = session.threadId ?? 'global';
            const existing = next.get(key) ?? [];
            next.set(key, [...existing, session]);
          }
          setTerminalSessionsByThread(next);

          // Attach to a matching session for the current thread if one exists
          const currentKey = resolveThreadKey(activeThreadIdRef.current);
          const matchingSessions = next.get(currentKey) ?? [];
          const preferredId =
            activeTerminalSessionByThread[currentKey] ??
            matchingSessions[0]?.id;

          if (preferredId) {
            sessionIdRef.current = preferredId;
            setActiveTerminalSession(currentKey, preferredId);
            setStatus('attaching...');
            socket.emit('terminal:attach', { sessionId: preferredId });
          } else {
            // No existing session — boot a fresh one for this thread
            startSession('shell');
          }
        },
        onSessionAttached: (session) => {
          const key = resolveThreadKey(activeThreadIdRef.current);
          syncResolvedSession(session);
          // Ensure it's tracked in the map even if we rehydrated from a fresh list
          addTerminalSession(key, session);
          setActiveTerminalSession(key, session.id);
        },
        setStatus,
        socket,
        terminal,
      });
    }

    bootTerminal().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Could not load terminal UI.';
      setStatus(message);
    });

    return () => {
      disposed = true;
      const socket = socketRef.current;

      resizeObserverRef.current?.disconnect();
      detachConnectHandler?.();
      detachSocketHandlers?.();
      dataDisposableRef.current?.dispose();
      terminalRef.current?.dispose();
      socket?.disconnect();
      resizeObserverRef.current = null;
      dataDisposableRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      terminalRef.current = null;
      socketRef.current = null;
      sessionIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiService, hostedCloud]);

  // T7: Cmd/Ctrl+F → open search bar
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key === 'f') {
        // Only intercept when terminal container is focused
        if (containerRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          setIsSearchOpen(true);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    activeKind,
    activeSessionId,
    containerRef,
    cwdInput,
    isSearchOpen,
    killSession,
    persistCwdInput,
    searchQuery,
    sessions,
    setCwdInput,
    setSearchQuery,
    startSession,
    status,
    submitCwd,
    switchSession,
    toggleSearch,
  };
}

// ---------------------------------------------------------------------------
// Body — T8 right-click "Send selection to agent"
// ---------------------------------------------------------------------------

interface AgentCliTerminalBodyProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isSearchOpen?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onCloseSearch?: () => void;
  onSendSelection?: (text: string) => void;
}

export function AgentCliTerminalBody({
  containerRef,
  isSearchOpen = false,
  searchQuery = '',
  onSearchQueryChange,
  onCloseSearch,
  onSendSelection,
}: AgentCliTerminalBodyProps): ReactElement {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handleSendSelection = useCallback(() => {
    setContextMenu(null);
    // xterm exposes getSelection via the terminal element's shadow DOM; we
    // read window.getSelection() as a fallback since xterm syncs to it.
    const selection = window.getSelection()?.toString() ?? '';
    if (selection && onSendSelection) {
      onSendSelection(selection);
    }
  }, [onSendSelection]);

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        onCloseSearch?.();
      }
    },
    [onCloseSearch],
  );

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    function handleClick(): void {
      setContextMenu(null);
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  return (
    <div
      className="relative flex h-full flex-col font-mono text-[13px] leading-relaxed"
      data-testid="agent-cli-terminal"
      onClick={() => containerRef.current?.querySelector('textarea')?.focus()}
      onContextMenu={handleContextMenu}
      role="presentation"
    >
      {/* T7: Inline search bar */}
      {isSearchOpen && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border/30 bg-background/80 px-3 py-1 backdrop-blur-sm">
          <Input
            aria-label="Terminal search"
            autoFocus
            className="h-6 min-w-0 flex-1 rounded border border-border/50 bg-background/30 px-2 text-[11px] text-foreground/70 outline-none transition-colors placeholder:text-foreground/28 focus:border-emerald-300/50"
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            spellCheck={false}
            value={searchQuery}
          />
          <Button
            aria-label="Close search"
            className="h-6 rounded border border-border/60 px-2 text-[11px] text-foreground/55 transition-colors hover:border-emerald-300/50 hover:text-emerald-200"
            label="✕"
            onClick={(event) => {
              event.stopPropagation();
              onCloseSearch?.();
            }}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        </div>
      )}

      <div
        ref={containerRef}
        aria-label="Genfeed terminal"
        className="min-h-0 flex-1 overflow-hidden bg-[#050806] px-3 py-2 text-[13px] text-foreground/78 outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/35 [&_.xterm-screen]:outline-none [&_.xterm-viewport]:overflow-y-auto"
        role="textbox"
        tabIndex={0}
      />

      {/* T8: Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] overflow-hidden rounded border border-border/60 bg-background shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <Button
            className="w-full px-3 py-2 text-left text-[12px] text-foreground/80 transition-colors hover:bg-foreground/5"
            label="Send selection to agent"
            onClick={handleSendSelection}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls — T6 multi-session tab strip + existing kind presets
// ---------------------------------------------------------------------------

interface AgentCliTerminalControlsProps {
  controller: AgentCliTerminalController;
}

export function AgentCliTerminalControls({
  controller,
}: AgentCliTerminalControlsProps): ReactElement {
  const {
    activeKind,
    activeSessionId,
    cwdInput,
    isSearchOpen,
    killSession,
    persistCwdInput,
    sessions,
    setCwdInput,
    startSession,
    status,
    submitCwd,
    switchSession,
    toggleSearch,
  } = controller;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitCwd();
    },
    [submitCwd],
  );

  const activePreset =
    TERMINAL_PRESETS.find((preset) => preset.kind === activeKind) ??
    TERMINAL_PRESETS[0];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <span className="min-w-[4.5rem] max-w-[10rem] truncate text-[11px] text-foreground/42">
          {status}
        </span>

        {sessions.length > 0 && (
          <div className="flex min-w-0 shrink items-center gap-1 overflow-x-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex shrink-0 items-center gap-0.5"
              >
                <Button
                  className={cn(
                    TERMINAL_CONTROL_CLASS,
                    'max-w-[7rem] gap-1.5 px-2',
                    activeSessionId === session.id &&
                      'border-emerald-300/50 bg-emerald-300/[0.06] text-emerald-200',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    switchSession(session.id);
                  }}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <span className="truncate">{session.kind}</span>
                </Button>
                <Button
                  aria-label={`Close ${session.kind} session`}
                  className={cn(
                    TERMINAL_ICON_CONTROL_CLASS,
                    'size-7 hover:border-red-400/45 hover:text-red-300',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    killSession(session.id);
                  }}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        className="hidden min-w-[10rem] max-w-[18rem] shrink items-center gap-1 md:flex"
        onSubmit={handleSubmit}
      >
        <Input
          aria-label="Terminal working directory"
          className="h-7 min-w-0 flex-1 rounded-md border border-border/50 bg-background/30 px-2 text-[11px] leading-none text-foreground/70 outline-none transition-colors placeholder:text-foreground/28 focus:border-emerald-300/50"
          onChange={(event) => setCwdInput(event.target.value)}
          onBlur={persistCwdInput}
          placeholder="$HOME or /path/to/project"
          spellCheck={false}
          value={cwdInput}
        />
        <Button
          className={TERMINAL_CONTROL_CLASS}
          label="cwd"
          type="submit"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        />
      </form>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Open terminal session menu"
            className={cn(TERMINAL_CONTROL_CLASS, 'gap-1.5')}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New</span>
            <span className="hidden max-w-[5rem] truncate lg:inline">
              {activePreset.label}
            </span>
            <ChevronDown className="size-3 text-foreground/42" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>New session</DropdownMenuLabel>
          {TERMINAL_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.kind}
              onSelect={() => startSession(preset.kind)}
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium">
                  {preset.label}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {preset.description}
                </p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        aria-label="Search terminal"
        className={cn(
          TERMINAL_ICON_CONTROL_CLASS,
          isSearchOpen &&
            'border-emerald-300/50 bg-emerald-300/[0.06] text-emerald-200',
        )}
        onClick={(event) => {
          event.stopPropagation();
          toggleSearch();
        }}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        <Search className="size-3.5" />
      </Button>
    </div>
  );
}
