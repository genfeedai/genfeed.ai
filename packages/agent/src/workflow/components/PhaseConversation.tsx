import { cn } from '@helpers/formatting/cn/cn.util';
import { Bot, User } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
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
          isAgent ? 'bg-violet-500/15' : 'bg-blue-500/15',
        )}
      >
        {isAgent ? (
          <Bot className="size-4 text-violet-400" />
        ) : (
          <User className="size-4 text-blue-400" />
        )}
      </span>
      <div>
        <div
          className={cn(
            'px-3 py-2 rounded-xl text-sm text-white/80',
            isAgent
              ? 'bg-white/5 rounded-tl-sm'
              : 'bg-blue-500/10 rounded-tr-sm',
          )}
        >
          {content}
        </div>
        <p
          className={cn(
            'text-[10px] text-white/30 mt-1',
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
  const messages = useAgentWorkflowStore((s) => s.getPhaseMessages(phase));

  if (messages.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-medium text-white/30 uppercase tracking-wider px-2">
          {PHASE_LABELS[phase]}
        </span>
        <div className="h-px flex-1 bg-white/10" />
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
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-4 overflow-y-auto max-h-[400px] p-3 rounded-xl bg-black/20 border border-white/5"
    >
      {messages.length === 0 ? (
        <p className="text-sm text-white/30 text-center py-6">
          No messages yet
        </p>
      ) : (
        WORKFLOW_PHASES.map((phase) => (
          <PhaseSection key={phase} phase={phase} />
        ))
      )}
    </div>
  );
}

export const PhaseConversation = memo(PhaseConversationInner);
