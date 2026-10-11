'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { CSSProperties } from 'react';
import SidebarLogoMark from './SidebarLogoMark';

type SidebarLogoToggleButtonProps = {
  ariaLabel: string;
  className?: string;
  direction: 'collapse' | 'expand';
  onClick: () => void;
  style?: CSSProperties;
};

export default function SidebarLogoToggleButton({
  ariaLabel,
  className,
  direction,
  onClick,
  style,
}: SidebarLogoToggleButtonProps) {
  const DirectionIcon =
    direction === 'collapse' ? PanelLeftClose : PanelLeftOpen;

  return (
    <Button
      type="button"
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      withWrapper={false}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      ariaLabel={ariaLabel}
      className={cn(
        'group relative flex size-8 flex-shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground/72 shadow-none transition-colors',
        'hover:bg-foreground/[0.06] hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      data-sidebar-direction={direction}
      style={style}
      tooltip={ariaLabel}
    >
      <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
        <SidebarLogoMark />
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-foreground/62 opacity-0 transition-opacity duration-150 group-hover:text-foreground group-hover:opacity-100 group-focus-visible:text-foreground group-focus-visible:opacity-100"
      >
        <DirectionIcon className="size-4 stroke-[1.75]" />
      </span>
    </Button>
  );
}
