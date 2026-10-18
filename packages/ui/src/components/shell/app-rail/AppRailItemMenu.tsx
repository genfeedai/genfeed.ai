'use client';

import type { AppRailItemMenuProps } from '@genfeedai/props/ui/app-rail.props';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ArrowDown, ArrowUp, PinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The right-click menu on a rail item: move it, or take it off the rail. It
 * opens at the pointer, so the rail itself stays the only place the member
 * arranges apps.
 */
export function AppRailItemMenu({
  index,
  isReorderable,
  onClose,
  onMove,
  onUnpin,
  target,
  total,
}: AppRailItemMenuProps) {
  const t = useTranslations('common.appRail');

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      open={target !== null}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: target?.x ?? 0, top: target?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      {target ? (
        <DropdownMenuContent
          align="start"
          data-testid="app-rail-item-menu"
          side="right"
          sideOffset={4}
        >
          {isReorderable ? (
            <>
              <DropdownMenuItem
                data-testid="app-rail-item-menu-move-up"
                disabled={index <= 0}
                onSelect={() => onMove(target.item, -1)}
              >
                <ArrowUp aria-hidden="true" className="size-4" />
                {t('moveUp', { app: target.item.label })}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="app-rail-item-menu-move-down"
                disabled={index >= total - 1}
                onSelect={() => onMove(target.item, 1)}
              >
                <ArrowDown aria-hidden="true" className="size-4" />
                {t('moveDown', { app: target.item.label })}
              </DropdownMenuItem>
            </>
          ) : null}
          {isReorderable && onUnpin ? <DropdownMenuSeparator /> : null}
          {onUnpin ? (
            <DropdownMenuItem
              data-testid="app-rail-item-menu-unpin"
              onSelect={() => onUnpin(target.item)}
            >
              <PinOff aria-hidden="true" className="size-4" />
              {t('unpin', { app: target.item.label })}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}

export default AppRailItemMenu;
