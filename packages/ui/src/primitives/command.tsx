'use client';

import type { DialogProps } from '@radix-ui/react-dialog';
import {
  Command as ShipCommand,
  CommandEmpty as ShipCommandEmpty,
  CommandGroup as ShipCommandGroup,
  CommandItem as ShipCommandItem,
  CommandList as ShipCommandList,
  CommandSeparator as ShipCommandSeparator,
  CommandShortcut as ShipCommandShortcut,
} from '@shipshitdev/ui/primitives';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import type { ComponentPropsWithRef, HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent } from './dialog';

function Command({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive>) {
  return (
    <ShipCommand ref={ref} className={cn('ship-ui', className)} {...props} />
  );
}
Command.displayName = 'Command';

const CommandDialog = ({ children, ...props }: DialogProps) => (
  <Dialog {...props}>
    <DialogContent aria-describedby={undefined} className="overflow-hidden p-0">
      <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[data-cmdk-input-wrapper]_svg]:h-5 [&_[data-cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
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
    <div
      className="ship-ui flex items-center border-b border-border px-3"
      data-cmdk-input-wrapper=""
    >
      <Search className="mr-2 size-4 shrink-0 text-muted" />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm text-primary outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}
CommandInput.displayName = CommandPrimitive.Input.displayName;

function CommandList({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof CommandPrimitive.List>) {
  return (
    <ShipCommandList
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
    <ShipCommandEmpty
      ref={ref}
      className="ship-ui py-6 text-center text-sm text-muted"
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
    <ShipCommandGroup
      ref={ref}
      className={cn('ship-ui', className)}
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
    <ShipCommandSeparator
      ref={ref}
      className={cn('ship-ui', className)}
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
    <ShipCommandItem
      ref={ref}
      className={cn('ship-ui', className)}
      {...props}
    />
  );
}
CommandItem.displayName = 'CommandItem';

const CommandShortcut = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <ShipCommandShortcut
    className={cn('ship-ui text-muted', className)}
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
