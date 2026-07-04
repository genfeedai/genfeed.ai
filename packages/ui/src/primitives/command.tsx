'use client';

import type { DialogProps } from '@radix-ui/react-dialog';
import {
  Command as ShipCommand,
  CommandEmpty as ShipCommandEmpty,
  CommandGroup as ShipCommandGroup,
  CommandInput as ShipCommandInput,
  CommandItem as ShipCommandItem,
  CommandList as ShipCommandList,
  CommandSeparator as ShipCommandSeparator,
  CommandShortcut as ShipCommandShortcut,
} from '@shipshitdev/ui/primitives';
// Types only: cmdk's prop shapes are identical to ship's bundled copy, but ship
// bundles its OWN cmdk instance — so every RENDERED command part must come from
// @shipshitdev/ui/primitives to share one context. Using the standalone package
// for rendering (e.g. CommandPrimitive.Input) mounts a detached context and
// throws "Cannot read properties of undefined (reading 'subscribe')".
import type { Command as CommandPrimitive } from 'cmdk';
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
    <ShipCommandInput
      ref={ref}
      className={cn('ship-ui', className)}
      {...props}
    />
  );
}
CommandInput.displayName = 'CommandInput';

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
