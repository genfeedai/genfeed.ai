'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiBars3BottomLeft, HiChevronRight } from 'react-icons/hi2';

type CollapsedSidebarLogoToggleProps = {
  onClick: () => void;
};

export default function CollapsedSidebarLogoToggle({
  onClick,
}: CollapsedSidebarLogoToggleProps) {
  return (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      ariaLabel="Expand sidebar"
      className="group fixed left-2 z-[60] hidden size-8 items-center justify-center rounded-md border border-border/70 bg-background/95 text-foreground/72 shadow-sm backdrop-blur transition-colors hover:border-foreground/20 hover:bg-background-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:flex"
      style={{ top: 'calc(var(--desktop-titlebar-height) + 0.5rem)' }}
    >
      <span className="relative flex size-4 items-center justify-center">
        <HiBars3BottomLeft className="size-4" />
        <HiChevronRight className="absolute -right-1 size-3 rounded-full bg-background text-foreground/46 transition-colors group-hover:text-foreground/82" />
      </span>
    </Button>
  );
}
