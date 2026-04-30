'use client';

import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  type KeyboardEvent,
  type ReactElement,
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

interface AgentCliTerminalProps {
  apiService: AgentApiService;
}

const CLI_COMMANDS: Record<string, string> = {
  '/clear': 'Clear terminal output',
  '/generate': 'Generate content — /generate <prompt>',
  '/help': 'Show available commands',
  '/new': 'Start new thread',
  '/status': 'Show current thread status',
  '/threads': 'List recent threads',
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

export function AgentCliTerminal({
  apiService: _apiService,
}: AgentCliTerminalProps): ReactElement {
  const [lines, setLines] = useState<CliLine[]>(() => [
    createLine('system', 'genfeed cli v0.4.0 — type /help for commands'),
  ]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);

  const addLine = useCallback((type: CliLine['type'], content: string) => {
    setLines((prev) => [...prev, createLine(type, content)]);
  }, []);

  const handleCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      addLine('command', trimmed);

      if (trimmed === '/help') {
        const helpLines = Object.entries(CLI_COMMANDS)
          .map(([cmd, desc]) => `  ${cmd.padEnd(14)} ${desc}`)
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
        // TODO: wire to apiService.listThreads
        addLine('output', 'thread listing not yet connected');
        return;
      }

      if (trimmed === '/status') {
        addLine(
          'output',
          activeThreadId
            ? `active thread: ${activeThreadId}`
            : 'no active thread',
        );
        return;
      }

      if (trimmed === '/new') {
        addLine('system', 'starting new thread...');
        // TODO: wire to thread creation
        return;
      }

      if (trimmed.startsWith('/generate ')) {
        const prompt = trimmed.slice('/generate '.length);
        addLine('output', `generating: "${prompt}"...`);
        // TODO: wire to apiService.sendMessage
        return;
      }

      if (trimmed.startsWith('/')) {
        addLine('error', `unknown command: ${trimmed.split(' ')[0]}`);
        addLine('system', 'type /help for available commands');
        return;
      }

      // Plain text = send as message to agent
      addLine('output', 'sending to agent...');
      // TODO: wire to agent chat send
    },
    [activeThreadId, addLine],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleCommand(inputValue);
        setInputValue('');
      }
    },
    [handleCommand, inputValue],
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
      className="flex h-full flex-col font-mono text-[13px] leading-relaxed"
      data-testid="agent-cli-terminal"
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      {/* Output area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {lines.map((line) => (
          <div
            key={line.id}
            className={cn(
              'whitespace-pre-wrap py-0.5',
              line.type === 'command' && 'text-foreground',
              line.type === 'output' && 'text-foreground/70',
              line.type === 'error' && 'text-red-400',
              line.type === 'system' && 'text-foreground/40 italic',
            )}
          >
            {line.type === 'command' ? (
              <span>
                <span className="text-emerald-400">gf</span>
                <span className="text-foreground/40"> &gt; </span>
                {line.content}
              </span>
            ) : (
              line.content
            )}
          </div>
        ))}
      </div>

      {/* Input prompt */}
      <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5">
        <span className="shrink-0 select-none text-emerald-400">gf</span>
        <span className="shrink-0 select-none text-foreground/40">&gt;</span>
        <Input
          inputRef={inputRef}
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent text-foreground shadow-none caret-emerald-400 outline-none ring-0 focus-visible:border-0 focus-visible:ring-0 placeholder:text-foreground/30"
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
            className="shrink-0 text-[11px] font-medium text-foreground/50 hover:text-foreground"
          >
            ↵
          </Button>
        )}
      </div>
    </div>
  );
}
