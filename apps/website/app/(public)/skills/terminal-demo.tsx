'use client';

import { TERMINAL_COMMANDS } from '@public/skills/_data';
import { useEffect, useState } from 'react';

export default function TerminalDemo(): React.ReactElement {
  const [currentLine, setCurrentLine] = useState(0);
  const isTyping = currentLine < TERMINAL_COMMANDS.length;

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const delay = currentLine === 0 ? 800 : currentLine <= 1 ? 600 : 300;
    const timer = setTimeout(() => setCurrentLine((prev) => prev + 1), delay);

    return () => clearTimeout(timer);
  }, [currentLine, isTyping]);

  return (
    <div className="overflow-hidden border border-edge/10 bg-black/40">
      <div className="flex items-center gap-2 px-4 py-3 bg-fill/5 border-b border-edge/10">
        <div className="flex gap-2">
          <div className="size-3 rounded-full bg-fill/20" />
          <div className="size-3 rounded-full bg-fill/20" />
          <div className="size-3 rounded-full bg-fill/20" />
        </div>
        <div className="flex-1 text-center text-xs text-surface/30 font-mono uppercase tracking-widest">
          terminal
        </div>
      </div>

      <div className="p-6 font-mono text-sm space-y-1.5 min-h-card">
        {TERMINAL_COMMANDS.slice(0, currentLine).map((line) => (
          <div key={line.command} className="flex flex-wrap gap-2">
            {line.prompt && (
              <span className="text-surface/30">{line.prompt}</span>
            )}
            {line.prompt && <span className="text-surface/40">$</span>}
            <span
              className={
                line.command.startsWith('#')
                  ? 'text-emerald-400/60'
                  : line.command.startsWith('✓')
                    ? 'text-emerald-400/40'
                    : line.command.startsWith('...')
                      ? 'text-surface/30'
                      : 'text-surface/80'
              }
            >
              {line.command}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2">
            <span className="text-surface/30">
              {TERMINAL_COMMANDS[currentLine]?.prompt || ''}
            </span>
            {TERMINAL_COMMANDS[currentLine]?.prompt && (
              <span className="text-surface/40">$</span>
            )}
            <span className="w-2 h-4 bg-fill/40 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
