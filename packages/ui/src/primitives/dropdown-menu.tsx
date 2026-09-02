'use client';

import { cn } from '@genfeedai/helpers';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Minus } from 'lucide-react';
import type { ComponentPropsWithRef, HTMLAttributes } from 'react';
import { overlayMenuSurfaceClassName } from './field-control';

const DropdownMenu: typeof DropdownMenuPrimitive.Root =
  DropdownMenuPrimitive.Root;

const DropdownMenuTrigger: typeof DropdownMenuPrimitive.Trigger =
  DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup: typeof DropdownMenuPrimitive.Group =
  DropdownMenuPrimitive.Group;

const DropdownMenuPortal: typeof DropdownMenuPrimitive.Portal =
  DropdownMenuPrimitive.Portal;

const DropdownMenuSub: typeof DropdownMenuPrimitive.Sub =
  DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup: typeof DropdownMenuPrimitive.RadioGroup =
  DropdownMenuPrimitive.RadioGroup;

function DropdownMenuSubTrigger({
  ref,
  className,
  inset,
  children,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        'mx-1 flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-[13px] text-foreground outline-none hover:bg-hover focus:bg-hover data-[disabled]:pointer-events-none data-[state=open]:bg-hover data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight size={12} className="ml-auto text-muted-foreground" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

function DropdownMenuSubContent({
  ref,
  className,
  sideOffset = 8,
  onPointerDownOutside,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        sideOffset={sideOffset}
        onPointerDownOutside={(event) => {
          const target = event.target as Element | null;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            event.preventDefault();
          }
          onPointerDownOutside?.(event);
        }}
        className={cn(
          'app-region-no-drag z-[10001] min-w-[160px] overflow-hidden rounded-md py-1',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

function DropdownMenuContent({
  ref,
  className,
  sideOffset = 4,
  align = 'end',
  onPointerDownOutside,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        onPointerDownOutside={(event) => {
          const target = event.target as Element | null;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            event.preventDefault();
          }
          onPointerDownOutside?.(event);
        }}
        className={cn(
          'app-region-no-drag z-[10001] min-w-[160px] overflow-hidden rounded-md py-1',
          overlayMenuSurfaceClassName,
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

function DropdownMenuItem({
  ref,
  className,
  inset,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'mx-1 flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-[13px] text-foreground outline-none hover:bg-hover focus:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

function DropdownMenuCheckboxItem({
  ref,
  className,
  children,
  checked,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'relative mx-1 flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors focus:bg-hover hover:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

function DropdownMenuRadioItem({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative mx-1 flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors focus:bg-hover hover:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Minus className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

function DropdownMenuLabel({
  ref,
  className,
  inset,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        'px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

function DropdownMenuSeparator({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        'ml-auto text-2xs uppercase tracking-[0.16em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
