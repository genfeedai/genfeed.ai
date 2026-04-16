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
        'group flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/80 transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        className,
      )}
    >
      <span className="text-white/80 transition-colors duration-200 group-hover:text-white">
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium text-white/90">{label}</span>
      <Kbd
        variant="ghost"
        className="ml-auto text-[11px] opacity-0 transition-opacity duration-200 group-hover:text-white/50 group-hover:opacity-100"
      >
        {shortcut}
      </Kbd>
    </Button>
  );
}
