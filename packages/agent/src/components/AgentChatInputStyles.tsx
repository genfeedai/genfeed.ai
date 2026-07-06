import type { ReactElement } from 'react';

export function AgentChatInputStyles(): ReactElement {
  return (
    <style>{`
        .ProseMirror {
          min-height: 36px;
          max-height: 200px;
          overflow-y: auto;
          outline: none;
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
        .mention-content {
          background-color: hsl(150 60% 45% / 0.15);
          color: hsl(150 60% 45%);
        }
      `}</style>
  );
}
