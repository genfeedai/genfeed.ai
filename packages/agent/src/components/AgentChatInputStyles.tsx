import type { ReactElement } from 'react';

export function AgentChatInputStyles(): ReactElement {
  return (
    // Hoisted to <head>: an in-place <style> breaks hydration (#6601).
    <style href="genfeed-agent-chat-input" precedence="genfeed-component">{`
        [data-density='dock'] .ProseMirror {
          min-height: 56px;
        }
        [data-density] .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          pointer-events: none;
          height: 0;
          color: hsl(var(--muted-foreground));
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
