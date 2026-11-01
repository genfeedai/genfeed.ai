import { CardGap, CardPadding, CardVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Bot, User } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useAgentWorkflowStore } from '../store';
import { PHASE_LABELS, WORKFLOW_PHASES, type WorkflowPhase } from '../types';

function MessageBubble({
  role,
  content,
  timestamp,
}: {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}) {
  const isAgent = role === 'agent';
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex gap-2.5 max-w-[85%]',
        isAgent ? 'self-start' : 'self-end flex-row-reverse',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center size-7 rounded-full shrink-0',
          isAgent ? 'bg-primary/10' : 'bg-info/10',
        )}
      >
        {isAgent ? (
          <Bot className="size-4 text-primary" />
        ) : (
          <User className="size-4 text-info" />
        )}
      </span>
      <div>
        <div
          className={cn(
            'px-3 py-2 rounded-xl text-sm text-foreground/80',
            isAgent
              ? 'bg-foreground/5 rounded-tl-sm'
              : 'bg-info/10 rounded-tr-sm',
          )}
        >
          {content}
        </div>
        <p
          className={cn(
            'text-2xs text-muted-foreground mt-1',
            isAgent ? 'text-left' : 'text-right',
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}

function PhaseSection({ phase }: { phase: WorkflowPhase }) {
  // `getPhaseMessages` allocates a fresh array per call, so it must not be
  // invoked inside the store selector — the snapshot would never be
  // referentially stable and `useSyncExternalStore` would re-render forever.
  const allMessages = useAgentWorkflowStore((s) => s.messages);
  const messages = useMemo(
    () => allMessages.filter((m) => m.phase === phase),
    [allMessages, phase],
  );

  if (messages.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-foreground/10" />
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider px-2">
          {PHASE_LABELS[phase]}
        </span>
        <div className="h-px flex-1 bg-foreground/10" />
      </div>
      <div className="flex flex-col gap-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseConversationInner() {
  const messages = useAgentWorkflowStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  return (
    <Card
      ref={scrollRef}
      variant={CardVariant.BORDERED}
      padding={CardPadding.SM}
      gap={CardGap.LG}
      className="max-h-[400px] overflow-y-auto"
    >
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No messages yet
        </p>
      ) : (
        WORKFLOW_PHASES.map((phase) => (
          <PhaseSection key={phase} phase={phase} />
        ))
      )}
    </Card>
  );
}

export const PhaseConversation = memo(PhaseConversationInner);
