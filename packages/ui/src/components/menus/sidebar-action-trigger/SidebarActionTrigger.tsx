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
        'group relative flex h-9 w-full flex-row items-center gap-3 rounded px-3 py-2 text-left text-white/80 transition',
        'hover:bg-white/[0.04]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center text-white/80 transition-all duration-200 group-hover:scale-105 group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90 transition-colors duration-200">
        {label}
      </span>
      <Kbd
        variant="ghost"
        className="ml-auto text-[11px] opacity-0 transition-opacity duration-200 group-hover:text-white/50 group-hover:opacity-100"
      >
        {shortcut}
      </Kbd>
    </Button>
  );
}
