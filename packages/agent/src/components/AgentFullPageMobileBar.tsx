import { ButtonVariant } from '@genfeedai/contracts';
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

const MOBILE_BAR_BUTTON_CLASS =
  'inline-flex items-center gap-2 border-foreground/[0.12] bg-foreground/[0.03] px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground';

export function AgentFullPageMobileBar({
  showThreadSidebar,
  hasThreadOutputs,
  showSetupPanel,
  onOpenThreads,
  onOpenOutputs,
  onOpenSetup,
}: AgentFullPageMobileBarProps): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-foreground/[0.08] px-4 py-3 xl:hidden">
      {showThreadSidebar ? (
        <Button
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={onOpenThreads}
          className={MOBILE_BAR_BUTTON_CLASS}
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
          className={MOBILE_BAR_BUTTON_CLASS}
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
          className={MOBILE_BAR_BUTTON_CLASS}
        >
          <Sparkles className="size-4" />
          Setup
        </Button>
      ) : null}
    </div>
  );
}
