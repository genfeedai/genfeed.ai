import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import type { ReactElement } from 'react';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';

interface AgentComposerContextRailProps {
  attachmentCount: number;
  referenceCount: number;
}

export function AgentComposerContextRail({
  attachmentCount,
  referenceCount,
}: AgentComposerContextRailProps): ReactElement {
  const shell = useConversationComposerShell();
  const contextLabel = shell?.contextLabel ?? 'Conversation';

  return (
    <div className="flex min-h-9 items-center gap-2 rounded-t-lg border-b border-border/70 bg-background-secondary/82 px-3 py-1.5">
      <HiOutlineChatBubbleLeftRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 truncate text-xs font-medium text-foreground/78">
        {contextLabel}
      </span>
      {referenceCount > 0 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {referenceCount} {referenceCount === 1 ? 'reference' : 'references'}
        </span>
      ) : null}
      {attachmentCount > 0 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {attachmentCount} {attachmentCount === 1 ? 'file' : 'files'}
        </span>
      ) : null}
      <div
        className="ml-auto flex shrink-0 items-center"
        data-composer-scope-controls-slot="true"
      >
        {shell?.scopeControls}
      </div>
    </div>
  );
}
