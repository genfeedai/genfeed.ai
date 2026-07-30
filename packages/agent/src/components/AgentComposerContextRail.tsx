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
    <div className="flex min-h-0 items-center gap-1.5 px-3.5 pt-2.5">
      <HiOutlineChatBubbleLeftRight
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 truncate text-[11px] font-medium text-foreground/55">
        {contextLabel}
      </span>
      {referenceCount > 0 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          · {referenceCount} {referenceCount === 1 ? 'reference' : 'references'}
        </span>
      ) : null}
      {attachmentCount > 0 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          · {attachmentCount} {attachmentCount === 1 ? 'file' : 'files'}
        </span>
      ) : null}
    </div>
  );
}
