'use client';

import { cn } from '@genfeedai/helpers';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import type { ComponentPropsWithRef, HTMLAttributes } from 'react';
import { overlayMenuSurfaceClassName } from './field-control';

const ContextMenu: typeof ContextMenuPrimitive.Root = ContextMenuPrimitive.Root;

const ContextMenuTrigger: typeof ContextMenuPrimitive.Trigger =
  ContextMenuPrimitive.Trigger;

const ContextMenuGroup: typeof ContextMenuPrimitive.Group =
  ContextMenuPrimitive.Group;

const ContextMenuSub: typeof ContextMenuPrimitive.Sub =
  ContextMenuPrimitive.Sub;

const itemClassName =
  'dropdown-case mx-1 flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-[13px] text-foreground outline-none hover:bg-hover focus:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

function ContextMenuContent({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={ref}
        collisionPadding={8}
        className={cn(
          'app-region-no-drag z-[10001] min-w-[200px] overflow-hidden rounded-md py-1',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}
ContextMenuContent.displayName = 'ContextMenuContent';

function ContextMenuItem({
  ref,
  className,
  isDestructive = false,
  ...props
}: ComponentPropsWithRef<typeof ContextMenuPrimitive.Item> & {
  /** Marks a delete-style action in the destructive colour. */
  isDestructive?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      className={cn(
        itemClassName,
        isDestructive && 'text-destructive focus:text-destructive',
        className,
      )}
      {...props}
    />
  );
}
ContextMenuItem.displayName = 'ContextMenuItem';

function ContextMenuSubTrigger({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(itemClassName, 'data-[state=open]:bg-hover', className)}
      {...props}
    >
      {children}
      <ChevronRight size={12} className="ml-auto text-muted-foreground" />
    </ContextMenuPrimitive.SubTrigger>
  );
}
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger';

function ContextMenuSubContent({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        ref={ref}
        collisionPadding={8}
        sideOffset={8}
        className={cn(
          'app-region-no-drag z-[10001] min-w-[160px] overflow-hidden rounded-md py-1',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}
ContextMenuSubContent.displayName = 'ContextMenuSubContent';

function ContextMenuLabel({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label
      ref={ref}
      className={cn(
        'px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
ContextMenuLabel.displayName = 'ContextMenuLabel';

function ContextMenuSeparator({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
ContextMenuSeparator.displayName = 'ContextMenuSeparator';

function ContextMenuShortcut({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'ml-auto text-2xs uppercase tracking-[0.16em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
ContextMenuShortcut.displayName = 'ContextMenuShortcut';

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
