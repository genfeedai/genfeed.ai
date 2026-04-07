'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Kbd } from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import { HiMagnifyingGlass } from 'react-icons/hi2';

interface SidebarSearchTriggerProps {
  onClick: () => void;
  className?: string;
}

export default function SidebarSearchTrigger({
  onClick,
  className,
}: SidebarSearchTriggerProps) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      ariaLabel="Open search"
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white/40 transition-colors duration-150 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/60',
        className,
      )}
    >
      <HiMagnifyingGlass className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 text-left">Find...</span>
      <Kbd variant="subtle" size="xs">
        {'\u2318'}K
      </Kbd>
    </Button>
  );
}
