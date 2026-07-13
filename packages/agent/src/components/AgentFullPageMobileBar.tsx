import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlinePhoto,
  HiOutlineSparkles,
} from 'react-icons/hi2';

type AgentFullPageMobileBarProps = {
  showThreadSidebar: boolean;
  hasThreadOutputs: boolean;
  showSetupPanel: boolean;
  onOpenThreads: () => void;
  onOpenOutputs: () => void;
  onOpenSetup: () => void;
};

const MOBILE_BAR_BUTTON_CLASS =
  'inline-flex items-center gap-2 border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-white/[0.06] hover:text-foreground';

export function AgentFullPageMobileBar({
  showThreadSidebar,
  hasThreadOutputs,
  showSetupPanel,
  onOpenThreads,
  onOpenOutputs,
  onOpenSetup,
}: AgentFullPageMobileBarProps): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3 xl:hidden">
      {showThreadSidebar ? (
        <Button
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
          onClick={onOpenThreads}
          className={MOBILE_BAR_BUTTON_CLASS}
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
          className={MOBILE_BAR_BUTTON_CLASS}
        >
          <HiOutlinePhoto className="size-4" />
          Outputs
        </Button>
      ) : null}
      {showSetupPanel ? (
        <Button
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
          onClick={onOpenSetup}
          className={MOBILE_BAR_BUTTON_CLASS}
        >
          <HiOutlineSparkles className="size-4" />
          Setup
        </Button>
      ) : null}
    </div>
  );
}
