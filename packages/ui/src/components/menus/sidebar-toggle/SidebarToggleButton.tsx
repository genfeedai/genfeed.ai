'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { PanelLeft } from 'lucide-react';
import type { CSSProperties } from 'react';

type SidebarToggleButtonProps = {
  ariaLabel: string;
  className?: string;
  onClick: () => void;
  style?: CSSProperties;
};

export default function SidebarToggleButton({
  ariaLabel,
  className,
  onClick,
  style,
}: SidebarToggleButtonProps) {
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
      style={style}
      tooltip={ariaLabel}
    >
      <PanelLeft
        aria-hidden="true"
        className="size-4 stroke-[1.75] text-foreground/62 transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
      />
    </Button>
  );
}
