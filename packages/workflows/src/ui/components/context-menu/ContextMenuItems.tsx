'use client';

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@genfeedai/ui/primitives/context-menu';
import type { ReactNode } from 'react';
import type { ContextMenuItemConfig } from './context-menu-config';

interface ContextMenuItemsProps {
  items: ContextMenuItemConfig[];
}

function ItemBody({ item }: { item: ContextMenuItemConfig }): ReactNode {
  return (
    <>
      {item.icon ? (
        <span className="flex size-4 items-center justify-center text-muted-foreground">
          {item.icon}
        </span>
      ) : null}
      {item.label ? <span className="flex-1">{item.label}</span> : null}
      {item.shortcut ? (
        <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
      ) : null}
    </>
  );
}

/**
 * Renders a menu description (see the `menus/` builders) with the shared
 * context-menu parts. The shared menu owns focus, arrow keys, Escape,
 * outside-click dismissal and viewport collision.
 */
export function ContextMenuItems({ items }: ContextMenuItemsProps) {
  return items.map((item) => {
    if (item.separator) {
      return <ContextMenuSeparator key={item.id} />;
    }

    if (item.submenu && item.submenu.length > 0) {
      return (
        <ContextMenuSub key={item.id}>
          <ContextMenuSubTrigger disabled={item.disabled}>
            <ItemBody item={{ ...item, shortcut: undefined }} />
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItems items={item.submenu} />
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    }

    return (
      <ContextMenuItem
        disabled={item.disabled}
        isDestructive={item.danger}
        key={item.id}
        onSelect={() => item.onClick?.()}
      >
        <ItemBody item={item} />
      </ContextMenuItem>
    );
  });
}
