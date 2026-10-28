'use client';

import { cn } from '@genfeedai/helpers';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  type ComponentPropsWithRef,
  createContext,
  type HTMLAttributes,
  use,
} from 'react';
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

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const DIALOG_SIZE_CLASSES: Record<DialogSize, string> = {
  full: 'h-[90vh] max-w-[95vw]',
  lg: 'max-w-2xl',
  md: 'max-w-lg',
  sm: 'max-w-sm',
  xl: 'max-w-4xl',
};

type DialogPlacement = 'center' | 'right';

const DIALOG_PLACEMENT_CLASSES: Record<DialogPlacement, string> = {
  center:
    'top-1/2 left-1/2 max-h-[90dvh] w-full -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-xl p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
  right: 'gen-dialog-panel-right inset-y-0 right-0 h-full w-full',
};

interface DialogContentProps
  extends ComponentPropsWithRef<typeof DialogPrimitive.Content> {
  /** `right` docks a full-height panel to the viewport edge; the caller sets its width. */
  placement?: DialogPlacement;
  showCloseButton?: boolean;
  /** Width preset; `full` also fixes the height so a body can own the scroll. */
  size?: DialogSize;
}

const DialogSizeContext = createContext<DialogSize>('md');

function DialogContent({
  ref,
  className,
  children,
  placement = 'center',
  showCloseButton = true,
  size = 'md',
  ...props
}: DialogContentProps) {
  useModalContentGlobalSideEffectCleanup();

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogSizeContext.Provider value={size}>
        <DialogPrimitive.Content
          ref={ref}
          aria-describedby={props['aria-describedby'] ?? undefined}
          className={cn(
            // The content stacks its header, body blocks, and footer with one gap,
            // so neither DialogHeader nor DialogFooter carries a margin.
            'fixed z-50 flex flex-col bg-elevated text-foreground shadow-dialog outline-none',
            DIALOG_PLACEMENT_CLASSES[placement],
            placement === 'center' && DIALOG_SIZE_CLASSES[size],
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground after:absolute after:-inset-2 after:content-[''] transition-colors hover:bg-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogSizeContext.Provider>
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
      'flex shrink-0 flex-col gap-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

/**
 * Scrolling region between header and footer. The content constrains itself to
 * the viewport, so only the body scrolls and the header and footer stay put.
 * Pass `scrollable={false}` when the children own their scrolling.
 */
function DialogBody({
  className,
  scrollable = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { scrollable?: boolean }) {
  const isScrollable = scrollable || use(DialogSizeContext) === 'full';

  return (
    <div
      className={cn(
        'min-h-0 flex-1',
        isScrollable && 'overflow-y-auto overscroll-contain',
        className,
      )}
      data-modal-scroll-region={isScrollable ? '' : undefined}
      {...props}
    />
  );
}
DialogBody.displayName = 'DialogBody';

const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end',
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

export type { DialogContentProps, DialogPlacement, DialogSize };
export {
  Dialog,
  DialogBody,
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
