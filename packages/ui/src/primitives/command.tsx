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
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent } from './dialog';

const Command = forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <ShipCommand ref={ref} className={cn('ship-ui', className)} {...props} />
));
Command.displayName = 'Command';

const CommandDialog = ({ children, ...props }: DialogProps) => (
  <Dialog {...props}>
    <DialogContent aria-describedby={undefined} className="overflow-hidden p-0">
      <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
        {children}
      </Command>
    </DialogContent>
  </Dialog>
);

const CommandInput = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="ship-ui flex items-center border-b border-border px-3"
    cmdk-input-wrapper=""
  >
    <Search className="mr-2 h-4 w-4 shrink-0 text-muted" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md bg-transparent py-3 text-sm text-primary outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <ShipCommandList
    ref={ref}
    className={cn(
      'max-h-dropdown overflow-y-auto overflow-x-hidden',
      className,
    )}
    {...props}
  />
));
CommandList.displayName = 'CommandList';

const CommandEmpty = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <ShipCommandEmpty
    ref={ref}
    className="ship-ui py-6 text-center text-sm text-muted"
    {...props}
  />
));
CommandEmpty.displayName = 'CommandEmpty';

const CommandGroup = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <ShipCommandGroup ref={ref} className={cn('ship-ui', className)} {...props} />
));
CommandGroup.displayName = 'CommandGroup';

const CommandSeparator = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ShipCommandSeparator
    ref={ref}
    className={cn('ship-ui', className)}
    {...props}
  />
));
CommandSeparator.displayName = 'CommandSeparator';

const CommandItem = forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ShipCommandItem ref={ref} className={cn('ship-ui', className)} {...props} />
));
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
