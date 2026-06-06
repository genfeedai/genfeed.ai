import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiArrowPath, HiOutlineClipboard } from 'react-icons/hi2';

type GenerationActionCardHoverActionsProps = {
  canCopy: boolean;
  onCopy: () => void;
  onRetry: () => void;
};

export function GenerationActionCardHoverActions({
  canCopy,
  onCopy,
  onRetry,
}: GenerationActionCardHoverActionsProps): ReactElement {
  return (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/[0.08] bg-background/80 px-1.5 py-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/card:opacity-100">
      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={onCopy}
        isDisabled={!canCopy}
        ariaLabel="Copy prompt"
        className="p-1 text-muted-foreground hover:text-foreground"
      >
        <HiOutlineClipboard className="size-3.5" />
      </Button>
      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={onRetry}
        ariaLabel="Retry"
        className="p-1 text-muted-foreground hover:text-foreground"
      >
        <HiArrowPath className="size-3.5" />
      </Button>
    </div>
  );
}
