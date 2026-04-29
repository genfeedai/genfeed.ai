'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Kbd } from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import type { ReactElement, ReactNode } from 'react';

interface SidebarActionTriggerProps {
  label: string;
  icon: ReactNode;
  shortcut: string;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

export default function SidebarActionTrigger({
  label,
  icon,
  shortcut,
  onClick,
  ariaLabel,
  className,
}: SidebarActionTriggerProps): ReactElement {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      ariaLabel={ariaLabel ?? label}
      className={cn(
        'group relative flex h-7 w-full flex-row items-center gap-2 rounded px-2.5 py-1 text-left text-foreground/72 transition-[background-color,color] duration-200',
        'hover:bg-white/[0.035] hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center text-foreground/42 transition-colors duration-200 group-hover:text-foreground/78">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em] text-foreground/88 transition-colors duration-200">
        {label}
      </span>
      <Kbd
        variant="ghost"
        className="ml-auto rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] text-foreground/36 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        {shortcut}
      </Kbd>
    </Button>
  );
}
