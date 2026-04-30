import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

interface CliLine {
  content: string;
  id: string;
  timestamp: string;
  type: 'command' | 'output' | 'error' | 'system';
}

const CLI_COMMANDS: Record<string, string> = {
  '/clear': 'Clear terminal output',
  '/generate': 'Generate content — /generate <prompt>',
  '/help': 'Show available commands',
  '/new': 'Start new thread',
  '/status': 'Show generation status',
  '/threads': 'List recent threads',
  '/workspace': 'Show active workspace info',
};

function formatTimestamp(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function createLine(type: CliLine['type'], content: string): CliLine {
  return {
    content,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: formatTimestamp(),
    type,
  };
}

interface TerminalViewProps {
  workspaceId: string | null;
}

export function TerminalView({ workspaceId }: TerminalViewProps) {
  const [lines, setLines] = useState<CliLine[]>(() => [
    createLine('system', 'genfeed cli v0.4.0'),
    createLine('system', `workspace: ${workspaceId ?? 'none'}`),
    createLine(
      'system',
      'type /help for commands or start typing to chat with the agent',
    ),
    createLine('system', ''),
  ]);
  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLine = useCallback((type: CliLine['type'], content: string) => {
    setLines((prev) => [...prev, createLine(type, content)]);
  }, []);

  const handleCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      setHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      addLine('command', trimmed);

      if (trimmed === '/help') {
        const helpLines = Object.entries(CLI_COMMANDS)
          .map(([cmd, desc]) => `  ${cmd.padEnd(16)} ${desc}`)
          .join('\n');
        addLine('output', helpLines);
        return;
      }

      if (trimmed === '/clear') {
        setLines([createLine('system', 'terminal cleared')]);
        return;
      }

      if (trimmed === '/threads') {
        addLine('output', 'fetching threads...');
        window.genfeedDesktop.cloud
          .listProjects()
          .then((projects) => {
            if (projects.length === 0) {
              addLine('output', 'no projects found');
            } else {
              for (const project of projects) {
                addLine('output', `  ${project.name} (${project.id})`);
              }
            }
          })
          .catch(() => {
            addLine('error', 'failed to fetch projects');
          });
        return;
      }

      if (trimmed === '/status') {
        addLine(
          'output',
          workspaceId
            ? `active workspace: ${workspaceId}`
            : 'no active workspace — open one with /workspace',
        );
        return;
      }

      if (trimmed === '/workspace') {
        if (workspaceId) {
          addLine('output', `workspace: ${workspaceId}`);
        } else {
          addLine('output', 'no workspace active. opening selector...');
          void window.genfeedDesktop.workspace.openWorkspace();
        }
        return;
      }

      if (trimmed === '/new') {
        addLine('system', 'starting new thread...');
        return;
      }

      if (trimmed.startsWith('/generate ')) {
        const prompt = trimmed.slice('/generate '.length);
        addLine('output', `generating: "${prompt}"...`);
        // TODO: wire to genfeedDesktop.cloud.generateContent
        addLine('system', 'generation pipeline not yet connected to CLI');
        return;
      }

      if (trimmed.startsWith('/')) {
        addLine('error', `unknown command: ${trimmed.split(' ')[0]}`);
        addLine('system', 'type /help for available commands');
        return;
      }

      // Plain text = send as message to agent
      addLine('output', `sending: "${trimmed}"...`);
      // TODO: wire to agent thread via IPC
      addLine('system', 'agent messaging not yet connected to CLI');
    },
    [workspaceId, addLine],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleCommand(inputValue);
        setInputValue('');
        return;
      }

      // History navigation
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (history.length === 0) return;
        const nextIndex =
          historyIndex === -1
            ? history.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        setInputValue(history[nextIndex]);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex === -1) return;
        const nextIndex = historyIndex + 1;
        if (nextIndex >= history.length) {
          setHistoryIndex(-1);
          setInputValue('');
        } else {
          setHistoryIndex(nextIndex);
          setInputValue(history[nextIndex]);
        }
      }
    },
    [handleCommand, inputValue, history, historyIndex],
  );

  // Auto-scroll when lines change
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll triggers on lines change intentionally
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="terminal-view"
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      <div className="terminal-header">
        <span className="terminal-title">genfeed</span>
        <span className="terminal-session">
          {workspaceId
            ? `workspace:${workspaceId.slice(0, 8)}`
            : 'no workspace'}
        </span>
      </div>

      <div ref={scrollRef} className="terminal-output">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`terminal-line terminal-line-${line.type}`}
          >
            {line.type === 'command' ? (
              <span>
                <span className="terminal-prompt-prefix">gf</span>
                <span className="terminal-prompt-arrow"> &gt; </span>
                {line.content}
              </span>
            ) : (
              line.content
            )}
          </div>
        ))}
      </div>

      <div className="terminal-input-row">
        <span className="terminal-prompt-prefix">gf</span>
        <span className="terminal-prompt-arrow">&gt;</span>
        <Input
          inputRef={inputRef}
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="terminal-input"
          placeholder="type a command or message..."
          spellCheck={false}
          autoComplete="off"
        />
        {inputValue.length > 0 && (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => {
              handleCommand(inputValue);
              setInputValue('');
            }}
            className="terminal-submit"
          >
            ↵
          </Button>
        )}
      </div>
    </div>
  );
}
