'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { Button } from '@ui/primitives/button';
import { ChevronRight, FileText } from 'lucide-react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

const DRILL_DOWN_GROUP_ICON_OVERRIDES = {
  Posts: FileText,
} as const;

/** A single row representing a drill-down group with > chevron */
export default function DrillDownGroupRow({
  group,
  isActive,
  defaultHref,
  onEnter,
}: {
  group: { group: string; items: MenuItemConfig[] };
  isActive: boolean;
  defaultHref?: string;
  onEnter: () => void;
}) {
  const { push } = useRouter();
  const prefetchDefaultHref = useNavigationPrefetch(defaultHref);
  const firstItem = group.items[0];
  const OutlineIcon =
    DRILL_DOWN_GROUP_ICON_OVERRIDES[
      group.group as keyof typeof DRILL_DOWN_GROUP_ICON_OVERRIDES
    ] ?? firstItem?.outline;

  const activateMenuShared = () => {
    onEnter();
    if (defaultHref) {
      push(defaultHref);
    }
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Keep native link behavior for modified/middle clicks.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    onEnter();
  };

  const rowClasses = cn(
    'flex w-full items-center gap-3 rounded px-3 py-1.5 transition-colors duration-150 group',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    isActive
      ? 'bg-foreground/[0.06] text-foreground'
      : 'text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground',
  );

  const content = (
    <>
      {OutlineIcon && (
        <OutlineIcon
          className={cn(
            'size-4 transition-colors duration-200',
            isActive
              ? 'text-primary'
              : 'text-foreground/80 group-hover:text-foreground',
          )}
        />
      )}
      <span
        className={cn(
          'text-xs font-medium flex-1 text-left',
          isActive ? 'text-foreground font-semibold' : 'text-foreground/90',
        )}
      >
        {group.group}
      </span>
      <ChevronRight className="size-4 text-foreground/30" />
    </>
  );

  if (defaultHref) {
    return (
      <Link
        href={defaultHref}
        onClick={handleLinkClick}
        prefetch={false}
        onFocus={prefetchDefaultHref}
        onMouseEnter={prefetchDefaultHref}
        className={rowClasses}
      >
        {content}
      </Link>
    );
  }

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={activateMenuShared}
      className={cn(rowClasses, 'cursor-pointer')}
    >
      {content}
    </Button>
  );
}
