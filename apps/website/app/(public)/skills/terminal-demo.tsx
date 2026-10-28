'use client';

import type { TerminalDemoProps } from '@props/website/terminal-demo.props';
import { useEffect, useState } from 'react';

export default function TerminalDemo({
  lines,
}: TerminalDemoProps): React.ReactElement {
  const [currentLine, setCurrentLine] = useState(0);
  const isTyping = currentLine < lines.length;

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const delay = currentLine === 0 ? 800 : currentLine <= 1 ? 600 : 300;
    const timer = setTimeout(() => setCurrentLine((prev) => prev + 1), delay);

    return () => clearTimeout(timer);
  }, [currentLine, isTyping]);

  return (
    <div
      className={
        'overflow-hidden border border-foreground/10 bg-black/40' /* design-system-allow-content-color -- terminal content */
      }
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-foreground/5 border-b border-foreground/10">
        <div className="flex gap-2">
          <div className="size-3 rounded-full bg-foreground/20" />
          <div className="size-3 rounded-full bg-foreground/20" />
          <div className="size-3 rounded-full bg-foreground/20" />
        </div>
        <div className="flex-1 text-center text-xs text-foreground/30 font-mono uppercase tracking-widest">
          terminal
        </div>
      </div>

      <div className="p-6 font-mono text-sm space-y-1.5 min-h-card">
        {lines.slice(0, currentLine).map((line) => (
          <div key={line.command} className="flex flex-wrap gap-2">
            {line.prompt && (
              <span className="text-foreground/30">{line.prompt}</span>
            )}
            {line.prompt && <span className="text-foreground/40">$</span>}
            <span
              className={
                line.command.startsWith('#')
                  ? 'text-success/60'
                  : line.command.startsWith('✓')
                    ? 'text-success/40'
                    : line.command.startsWith('...')
                      ? 'text-foreground/30'
                      : 'text-foreground/80'
              }
            >
              {line.command}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2">
            <span className="text-foreground/30">
              {lines[currentLine]?.prompt || ''}
            </span>
            {lines[currentLine]?.prompt && (
              <span className="text-foreground/40">$</span>
            )}
            <span className="w-2 h-4 bg-foreground/40 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
