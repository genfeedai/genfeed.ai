import { AgentChatInput } from '@genfeedai/agent/components/AgentChatInput';
import { AgentChatMessage } from '@genfeedai/agent/components/AgentChatMessage';
import type { AgentChatMessage as AgentChatMessageModel } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import LowCreditsBanner from '@ui/banners/low-credits/LowCreditsBanner';
import { Button } from '@ui/primitives/button';
import PromptBarSurfaceRenderer from '@ui/prompt-bars/surface/PromptBarSurfaceRenderer';
import { MISSION_CONTROL_PROMPT_BAR_SURFACE } from '@ui/prompt-bars/surface/prompt-bar-surface.config';
import { type ReactElement, useEffect, useRef } from 'react';
import { HiOutlineSparkles, HiOutlineXMark } from 'react-icons/hi2';
import type { AgentLabContext, AgentLabMode } from './MissionControlView';

type AgentLabSurfaceProps = {
  context: AgentLabContext | null;
  messages: AgentChatMessageModel[];
  mode: AgentLabMode;
  onClose: () => void;
  onCopy: (content: string) => void | Promise<void>;
  onSend: (content: string) => void;
  open: boolean;
};

export function AgentLabSurface({
  context,
  messages,
  mode,
  onClose,
  onCopy,
  onSend,
  open,
}: AgentLabSurfaceProps): ReactElement | null {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const viewport = scrollRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [open]);

  if (!open) {
    return null;
  }

  const shell = (
    <aside
      aria-label={
        mode === 'overlay'
          ? 'Agent overlay comparison surface'
          : 'Agent rail comparison surface'
      }
      data-mode={mode}
      data-testid="agent-lab-surface"
      className={cn(
        'relative flex h-full flex-col overflow-hidden border-l border-white/[0.08] bg-background/95 shadow-2xl backdrop-blur-xl',
        mode === 'overlay'
          ? 'w-full sm:w-[min(44rem,calc(100vw-3rem))]'
          : 'w-full sm:w-[24rem]',
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {mode === 'overlay' ? 'Overlay Sheet' : 'Right Rail'}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">
            {context?.title ?? 'Mission Control agent'}
          </h2>
        </div>
        <Button
          variant={ButtonVariant.GHOST}
          onClick={onClose}
          ariaLabel="Close agent lab surface"
          className="text-foreground/60 hover:text-foreground"
        >
          <HiOutlineXMark className="size-4" />
        </Button>
      </div>

      {context ? (
        <div className="border-b border-white/[0.08] px-4 py-3">
          <p className="text-sm text-foreground/80">{context.scopeSummary}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {context.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-foreground/55"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 pb-44"
        data-testid="agent-lab-messages"
      >
        {messages.length === 0 ? (
          <div className="mx-auto mt-20 max-w-sm text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HiOutlineSparkles className="size-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-foreground">
              Open the conversation from the page
            </h3>
            <p className="mt-2 text-sm text-foreground/60">
              Use the page, row, or bulk actions to seed the agent with context,
              then compare whether the rail or the overlay sheet feels better.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <AgentChatMessage
              key={message.id}
              message={message}
              messageIndex={index}
              onCopy={onCopy}
            />
          ))
        )}
      </div>

      <div className="relative shrink-0">
        <PromptBarSurfaceRenderer
          surface={MISSION_CONTROL_PROMPT_BAR_SURFACE}
          topContent={<LowCreditsBanner />}
        >
          <AgentChatInput
            onSend={onSend}
            placeholder="Ask about this Mission Control context…"
          />
        </PromptBarSurfaceRenderer>
      </div>
    </aside>
  );

  if (mode === 'overlay') {
    return (
      <div className="pointer-events-none fixed inset-0 z-40 top-16">
        <Button
          ariaLabel="Close"
          className="pointer-events-auto absolute inset-0 bg-black/45"
          onClick={onClose}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose();
            }
          }}
          tabIndex={-1}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        />
        <div className="pointer-events-auto absolute inset-y-0 right-0 flex justify-end">
          {shell}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-30 top-16 hidden sm:block">
      <div className="pointer-events-auto h-full">{shell}</div>
    </div>
  );
}
