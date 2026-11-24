import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Image, MessageSquare, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

type AgentFullPageMobileBarProps = {
  showThreadSidebar: boolean;
  hasThreadOutputs: boolean;
  showSetupPanel: boolean;
  onOpenThreads: () => void;
  onOpenOutputs: () => void;
  onOpenSetup: () => void;
};

export function AgentFullPageMobileBar({
  showThreadSidebar,
  hasThreadOutputs,
  showSetupPanel,
  onOpenThreads,
  onOpenOutputs,
  onOpenSetup,
}: AgentFullPageMobileBarProps): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3 xl:hidden">
      {showThreadSidebar ? (
        <Button
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={onOpenThreads}
          size={ButtonSize.SM}
        >
          <MessageSquare className="size-4" />
          Threads
        </Button>
      ) : null}
      {hasThreadOutputs ? (
        <Button
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={onOpenOutputs}
          size={ButtonSize.SM}
        >
          <Image className="size-4" />
          Outputs
        </Button>
      ) : null}
      {showSetupPanel ? (
        <Button
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={onOpenSetup}
          size={ButtonSize.SM}
        >
          <Sparkles className="size-4" />
          Setup
        </Button>
      ) : null}
    </div>
  );
}
