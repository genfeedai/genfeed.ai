import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineChatBubbleLeftRight, HiOutlinePhoto } from 'react-icons/hi2';

type AgentFullPageMobileBarProps = {
  showThreadSidebar: boolean;
  hasThreadOutputs: boolean;
  onOpenThreads: () => void;
  onOpenOutputs: () => void;
};

export function AgentFullPageMobileBar({
  showThreadSidebar,
  hasThreadOutputs,
  onOpenThreads,
  onOpenOutputs,
}: AgentFullPageMobileBarProps): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3 xl:hidden">
      {showThreadSidebar ? (
        <Button
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
          onClick={onOpenThreads}
          className="inline-flex items-center gap-2 border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-white/[0.06] hover:text-foreground"
        >
          <HiOutlineChatBubbleLeftRight className="size-4" />
          Threads
        </Button>
      ) : null}
      {hasThreadOutputs ? (
        <Button
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
          onClick={onOpenOutputs}
          className="inline-flex items-center gap-2 border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-white/[0.06] hover:text-foreground"
        >
          <HiOutlinePhoto className="size-4" />
          Outputs
        </Button>
      ) : null}
    </div>
  );
}
