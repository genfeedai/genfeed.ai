'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithRef, HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { useModalContentGlobalSideEffectCleanup } from '../utils/modal-global-side-effects';

const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

const DialogTrigger: typeof DialogPrimitive.Trigger = DialogPrimitive.Trigger;

const DialogPortal: typeof DialogPrimitive.Portal = DialogPrimitive.Portal;

const DialogClose: typeof DialogPrimitive.Close = DialogPrimitive.Close;

function DialogOverlay({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/72 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in', // design-system-allow-content-color -- modal scrim
        className,
      )}
      {...props}
    />
  );
}
DialogOverlay.displayName =
  DialogPrimitive.Overlay.displayName ?? 'DialogOverlay';

interface DialogContentProps
  extends ComponentPropsWithRef<typeof DialogPrimitive.Content> {
  showCloseButton?: boolean;
}

function DialogContent({
  ref,
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  useModalContentGlobalSideEffectCleanup();

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        aria-describedby={props['aria-describedby'] ?? undefined}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-elevated p-6 text-foreground shadow-dialog outline-none',
          'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
DialogContent.displayName =
  DialogPrimitive.Content.displayName ?? 'DialogContent';

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

function DialogTitle({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-base font-semibold leading-none', className)}
      {...props}
    />
  );
}
DialogTitle.displayName = DialogPrimitive.Title.displayName ?? 'DialogTitle';

function DialogDescription({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
DialogDescription.displayName =
  DialogPrimitive.Description.displayName ?? 'DialogDescription';

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
