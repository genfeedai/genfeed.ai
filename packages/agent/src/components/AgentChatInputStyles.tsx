import type { ReactElement } from 'react';

export function AgentChatInputStyles(): ReactElement {
  return (
    <style>{`
        .gen-agent-prompt-highlight {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
          pointer-events: none;
        }
        .gen-agent-prompt-highlight rect {
          x: 0.5px;
          y: 0.5px;
          width: calc(100% - 1px);
          height: calc(100% - 1px);
          rx: calc(var(--radius-workspace-composer) - 1px);
          fill: none;
          stroke: hsl(var(--foreground) / 0.65);
          stroke-width: 1px;
          stroke-linecap: round;
          stroke-dasharray: 8 92;
          animation: gen-agent-prompt-highlight 5s linear infinite;
        }
        @keyframes gen-agent-prompt-highlight {
          to {
            stroke-dashoffset: -100;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gen-agent-prompt-highlight rect {
            animation: none;
            stroke-dasharray: none;
          }
        }
        .ProseMirror {
          /* One line at rest, grows to five lines (text-sm = 20px/line +
             12px padding), then scrolls — Cursor-style composer. */
          min-height: 36px;
          max-height: 112px;
          overflow-y: auto;
          outline: none;
        }
        [data-density='dock'] .ProseMirror {
          min-height: 56px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          pointer-events: none;
          height: 0;
          color: hsl(var(--foreground) / 0.42);
        }
        .mention {
          border-radius: 0.25rem;
          padding: 0.125rem 0.25rem;
          font-weight: 500;
        }
        .mention-brand {
          background-color: hsl(35 90% 55% / 0.15);
          color: hsl(35 90% 55%);
        }
        .mention-team {
          background-color: hsl(210 90% 55% / 0.15);
          color: hsl(210 90% 55%);
        }
        .mention-credential {
          background-color: hsl(var(--primary) / 0.15);
          color: hsl(var(--primary));
        }
      `}</style>
  );
}
