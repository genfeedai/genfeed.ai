'use client';

import { cn } from '@genfeedai/helpers';
import type { DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentPropsWithRef, HTMLAttributes } from 'react';
import { Dialog, DialogContent } from './dialog';

function Command({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-xl bg-tertiary text-foreground',
        className,
      )}
      {...props}
    />
  );
}
Command.displayName = 'Command';

const CommandDialog = ({ children, ...props }: DialogProps) => (
  <Dialog {...props}>
    <DialogContent aria-describedby={undefined} className="overflow-hidden p-0">
      <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[data-cmdk-input-wrapper]_svg]:h-5 [&_[data-cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
        {children}
      </Command>
    </DialogContent>
  </Dialog>
);

function CommandInput({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center border-b border-border px-3">
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}
CommandInput.displayName = 'CommandInput';

function CommandList({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn(
        'max-h-dropdown overflow-y-auto overflow-x-hidden',
        className,
      )}
      {...props}
    />
  );
}
CommandList.displayName = 'CommandList';

function CommandEmpty({
  ref,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className="py-6 text-center text-sm text-muted-foreground"
      {...props}
    />
  );
}
CommandEmpty.displayName = 'CommandEmpty';

function CommandGroup({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs',
        className,
      )}
      {...props}
    />
  );
}
CommandGroup.displayName = 'CommandGroup';

function CommandSeparator({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}
CommandSeparator.displayName = 'CommandSeparator';

function CommandItem({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-hover data-[selected=true]:text-foreground data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
CommandItem.displayName = 'CommandItem';

const CommandShortcut = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'ml-auto text-xs tracking-widest text-muted-foreground',
      className,
    )}
    {...props}
  />
);
CommandShortcut.displayName = 'CommandShortcut';

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
