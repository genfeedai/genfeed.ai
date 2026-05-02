import type {
  DesktopTerminalKind,
  IDesktopTerminalSession,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TerminalViewProps {
  workspaceId: string | null;
}

const TERMINAL_COLS = 120;
const TERMINAL_ROWS = 32;

const TERMINAL_PRESETS: Array<{
  kind: DesktopTerminalKind;
  label: string;
}> = [
  { kind: 'shell', label: 'Shell' },
  { kind: 'genfeed', label: 'Genfeed' },
  { kind: 'claude', label: 'Claude' },
  { kind: 'codex', label: 'Codex' },
];

export function TerminalView({ workspaceId }: TerminalViewProps) {
  const [activeKind, setActiveKind] = useState<DesktopTerminalKind>('shell');
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [status, setStatus] = useState('starting shell...');
  const containerRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionRef = useRef<IDesktopTerminalSession | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  const fitTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;

    if (!terminal || !fitAddon) {
      return;
    }

    try {
      fitAddon.fit();
      const session = sessionRef.current;

      if (session) {
        void window.genfeedDesktop.terminal.resize(
          session.id,
          terminal.cols,
          terminal.rows,
        );
      }
    } catch {
      // xterm can throw while the container is hidden or has no dimensions.
    }
  }, []);

  const startSession = useCallback(
    async (kind: DesktopTerminalKind) => {
      const terminal = terminalRef.current;

      if (!terminal) {
        return;
      }

      const previousSession = sessionRef.current;
      if (previousSession) {
        await window.genfeedDesktop.terminal.kill(previousSession.id);
      }

      setActiveKind(kind);
      setStatus(`starting ${kind}...`);
      sessionRef.current = null;
      terminal.reset();
      fitTerminal();

      try {
        const nextSession = await window.genfeedDesktop.terminal.create({
          cols: terminal.cols || TERMINAL_COLS,
          kind,
          rows: terminal.rows || TERMINAL_ROWS,
          workspaceId,
        });
        sessionRef.current = nextSession;
        setStatus(`${nextSession.command} - ${nextSession.cwd}`);
        terminal.focus();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `failed to start ${kind} terminal`;
        setStatus(message);
        terminal.writeln(message);
      }
    },
    [fitTerminal, workspaceId],
  );

  useEffect(() => {
    let isDisposed = false;
    const dataDisposables: Array<{ dispose: () => void }> = [];

    const initializeTerminal = async () => {
      const [{ FitAddon }, { Terminal }] = await Promise.all([
        import('@xterm/addon-fit'),
        import('@xterm/xterm'),
      ]);

      if (isDisposed || !containerRef.current) {
        return;
      }

      const terminal = new Terminal({
        allowProposedApi: false,
        convertEol: true,
        cursorBlink: true,
        fontFamily:
          '"SF Mono", "Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
        fontSize: 13,
        letterSpacing: 0,
        lineHeight: 1.25,
        scrollback: 10_000,
        theme: {
          background: '#05070a',
          black: '#12161f',
          blue: '#69a7ff',
          brightBlack: '#4d5566',
          brightBlue: '#8abaff',
          brightCyan: '#86f7ff',
          brightGreen: '#93ffd4',
          brightMagenta: '#d7a5ff',
          brightRed: '#ff8a8a',
          brightWhite: '#ffffff',
          brightYellow: '#ffe08a',
          cursor: '#72f0c2',
          cyan: '#64dce8',
          foreground: '#d8e2ee',
          green: '#72f0c2',
          magenta: '#c084fc',
          red: '#ff6b6b',
          selectionBackground: '#243244',
          white: '#d8e2ee',
          yellow: '#ffd166',
        },
      });
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      dataDisposables.push(
        terminal.onData((data) => {
          const session = sessionRef.current;
          if (!session) {
            return;
          }

          void window.genfeedDesktop.terminal.write(session.id, data);
        }),
      );

      resizeObserverRef.current = new ResizeObserver(() => fitTerminal());
      resizeObserverRef.current.observe(containerRef.current);
      fitTerminal();
      setIsTerminalReady(true);
    };

    void initializeTerminal();

    return () => {
      isDisposed = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      for (const disposable of dataDisposables) {
        disposable.dispose();
      }
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setIsTerminalReady(false);
    };
  }, [fitTerminal]);

  useEffect(() => {
    if (!isTerminalReady) {
      return undefined;
    }

    const disposeData = window.genfeedDesktop.terminal.onData((event) => {
      if (event.sessionId !== sessionRef.current?.id) {
        return;
      }

      terminalRef.current?.write(event.data);
    });

    const disposeExit = window.genfeedDesktop.terminal.onExit((event) => {
      if (event.sessionId !== sessionRef.current?.id) {
        return;
      }

      setStatus(`exited with code ${event.exitCode ?? 0}`);
      terminalRef.current?.writeln(
        `\r\n[process exited with code ${event.exitCode ?? 0}]`,
      );
      sessionRef.current = null;
    });

    void startSession('shell');

    return () => {
      const session = sessionRef.current;
      if (session) {
        void window.genfeedDesktop.terminal.kill(session.id);
      }
      sessionRef.current = null;
      disposeData();
      disposeExit();
    };
  }, [isTerminalReady, startSession]);

  return (
    <div
      className="terminal-view"
      onClick={() => terminalRef.current?.focus()}
      role="presentation"
    >
      <div className="terminal-header">
        <span className="terminal-title">genfeed terminal</span>
        <span className="terminal-session">
          {workspaceId ? `workspace:${workspaceId.slice(0, 8)}` : 'local home'}
        </span>
        <span className="terminal-session terminal-status">{status}</span>
        <div className="terminal-presets">
          {TERMINAL_PRESETS.map((preset) => (
            <Button
              aria-pressed={preset.kind === activeKind}
              key={preset.kind}
              className={
                preset.kind === activeKind
                  ? 'terminal-preset active'
                  : 'terminal-preset'
              }
              onClick={(event) => {
                event.stopPropagation();
                void startSession(preset.kind);
              }}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="terminal-interactive" />
    </div>
  );
}
