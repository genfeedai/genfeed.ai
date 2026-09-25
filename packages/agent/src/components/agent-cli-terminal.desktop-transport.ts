import type {
  AgentTerminalTransport,
  TerminalCreatePayload,
} from '@genfeedai/agent/components/agent-cli-terminal.helpers';
import type { TerminalSessionDto } from '@genfeedai/agent/stores/agent-chat.store';
import type {
  IDesktopTerminalSession,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import type { Terminal as XtermTerminal } from '@xterm/xterm';

function readErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'The local terminal failed.';
  return message.replace(
    /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/,
    '',
  );
}

function toSessionDto(
  session: IDesktopTerminalSession,
  threadId?: string,
): TerminalSessionDto {
  return {
    createdAt: session.createdAt,
    cwd: session.cwd,
    id: session.id,
    kind: session.kind,
    ...(threadId ? { threadId } : {}),
  };
}

/**
 * Terminal transport over the Genfeed Desktop bridge: PTYs run in Electron
 * main on this computer, so Shell / Genfeed CLI / Claude CLI / Codex CLI work
 * with Genfeed Cloud or a self-hosted API. Sessions are started only on an
 * explicit pick (Electron asks the user to allow the first one).
 */
export function createDesktopTerminalTransport(params: {
  bridge: IGenfeedDesktopBridge;
  fitAndSyncSize: () => void;
  onSessionAttached: (session: TerminalSessionDto) => void;
  onSessionCreated: (session: TerminalSessionDto) => void;
  sessionIdRef: { current: string | null };
  setStatus: (status: string) => void;
  terminal: XtermTerminal;
}): { dispose: () => void; transport: AgentTerminalTransport } {
  const {
    bridge,
    fitAndSyncSize,
    onSessionAttached,
    onSessionCreated,
    sessionIdRef,
    setStatus,
    terminal,
  } = params;
  const sessions = new Map<string, TerminalSessionDto>();

  const unsubscribeData = bridge.terminal.onData((payload) => {
    if (payload.sessionId === sessionIdRef.current) {
      terminal.write(payload.data);
    }
  });

  const unsubscribeExit = bridge.terminal.onExit((payload) => {
    sessions.delete(payload.sessionId);
    if (payload.sessionId !== sessionIdRef.current) {
      return;
    }

    setStatus(`exited with code ${payload.exitCode ?? 0}`);
    terminal.writeln(`\r\n[process exited: ${payload.exitCode ?? 0}]`);
    sessionIdRef.current = null;
  });

  const transport: AgentTerminalTransport = {
    attach: (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) {
        setStatus('session ended');
        return;
      }

      sessionIdRef.current = session.id;
      setStatus(`${session.kind} - ${session.cwd}`);
      onSessionAttached(session);
      terminal.clear();
      terminal.writeln('[reattached — earlier output is not replayed]');
      fitAndSyncSize();
      terminal.focus();
    },
    autoStartsSessions: false,
    create: (payload: TerminalCreatePayload) => {
      bridge.terminal
        .create({
          cols: payload.cols,
          ...(payload.cwd ? { cwd: payload.cwd } : {}),
          kind: payload.kind,
          rows: payload.rows,
        })
        .then((session) => {
          const dto = toSessionDto(session, payload.threadId);
          sessions.set(dto.id, dto);
          sessionIdRef.current = dto.id;
          setStatus(`${dto.kind} - ${dto.cwd}`);
          onSessionCreated(dto);
          fitAndSyncSize();
          terminal.focus();
        })
        .catch((error: unknown) => {
          const message = readErrorMessage(error);
          setStatus(message);
          terminal.writeln(message);
        });
    },
    isConnected: () => true,
    kill: (sessionId) => {
      sessions.delete(sessionId);
      void bridge.terminal.kill(sessionId).catch(() => undefined);
    },
    resize: ({ cols, rows, sessionId }) => {
      void bridge.terminal
        .resize(sessionId, cols, rows)
        .catch(() => undefined);
    },
    write: ({ data, sessionId }) => {
      void bridge.terminal.write(sessionId, data).catch(() => undefined);
    },
  };

  return {
    dispose: () => {
      unsubscribeData();
      unsubscribeExit();
      // Nothing can reattach to these PTYs once this renderer view is gone.
      for (const sessionId of sessions.keys()) {
        void bridge.terminal.kill(sessionId).catch(() => undefined);
      }
      sessions.clear();
    },
    transport,
  };
}
