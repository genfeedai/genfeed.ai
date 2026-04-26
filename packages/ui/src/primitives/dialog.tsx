import {
  Dialog as ShipDialog,
  DialogClose as ShipDialogClose,
  DialogContent as ShipDialogContent,
  DialogDescription as ShipDialogDescription,
  DialogFooter as ShipDialogFooter,
  DialogHeader as ShipDialogHeader,
  DialogOverlay as ShipDialogOverlay,
  DialogPortal as ShipDialogPortal,
  DialogTitle as ShipDialogTitle,
  DialogTrigger as ShipDialogTrigger,
} from '@shipshitdev/ui/primitives';
import { X } from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '../lib/utils';

const Dialog = ShipDialog;

const DialogTrigger = ShipDialogTrigger;

const DialogPortal = ShipDialogPortal;

const DialogClose = ShipDialogClose;

const DialogOverlay = forwardRef<
  ComponentRef<typeof ShipDialogOverlay>,
  ComponentPropsWithoutRef<typeof ShipDialogOverlay>
>(({ className, ...props }, ref) => (
  <ShipDialogOverlay
    ref={ref}
    className={cn('bg-black/72 backdrop-blur-sm', className)}
    {...props}
  />
));
DialogOverlay.displayName = ShipDialogOverlay.displayName ?? 'DialogOverlay';

interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof ShipDialogContent> {
  showCloseButton?: boolean;
}

const DialogContent = forwardRef<
  ComponentRef<typeof ShipDialogContent>,
  DialogContentProps
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <ShipDialogContent
    ref={ref}
    aria-describedby={props['aria-describedby'] ?? undefined}
    className={cn(
      'ship-ui text-primary duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
      className,
    )}
    {...props}
  >
    {children}
    {showCloseButton && (
      <ShipDialogClose className="absolute right-4 top-4 rounded-md p-1 text-secondary transition-colors hover:bg-hover hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </ShipDialogClose>
    )}
  </ShipDialogContent>
));
DialogContent.displayName = ShipDialogContent.displayName ?? 'DialogContent';

const DialogHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'mb-4 flex flex-col gap-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = forwardRef<
  ComponentRef<typeof ShipDialogTitle>,
  ComponentPropsWithoutRef<typeof ShipDialogTitle>
>(({ className, ...props }, ref) => (
  <ShipDialogTitle
    ref={ref}
    className={cn('text-base font-semibold leading-none', className)}
    {...props}
  />
));
DialogTitle.displayName = ShipDialogTitle.displayName ?? 'DialogTitle';

const DialogDescription = forwardRef<
  ComponentRef<typeof ShipDialogDescription>,
  ComponentPropsWithoutRef<typeof ShipDialogDescription>
>(({ className, ...props }, ref) => (
  <ShipDialogDescription
    ref={ref}
    className={cn('text-sm text-secondary', className)}
    {...props}
  />
));
DialogDescription.displayName =
  ShipDialogDescription.displayName ?? 'DialogDescription';

export type { DialogContentProps };
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
