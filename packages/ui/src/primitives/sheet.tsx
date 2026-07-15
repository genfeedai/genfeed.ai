'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { ComponentPropsWithRef, HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { useModalContentGlobalSideEffectCleanup } from '../utils/modal-global-side-effects';

const Sheet: typeof SheetPrimitive.Root = SheetPrimitive.Root;

const SheetTrigger: typeof SheetPrimitive.Trigger = SheetPrimitive.Trigger;

const SheetClose: typeof SheetPrimitive.Close = SheetPrimitive.Close;

const SheetPortal: typeof SheetPrimitive.Portal = SheetPrimitive.Portal;

function SheetOverlay({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        'gen-sheet-overlay fixed inset-0 z-50 bg-black/80',
        className,
      )}
      {...props}
      ref={ref}
    />
  );
}
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-dialog will-change-transform',
  {
    defaultVariants: {
      side: 'right',
    },
    variants: {
      side: {
        bottom: 'gen-sheet-content-bottom inset-x-0 bottom-0 border-t',
        left: 'gen-sheet-content-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
        right:
          'gen-sheet-content-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
        top: 'gen-sheet-content-top inset-x-0 top-0 border-b',
      },
    },
  },
);

interface SheetContentProps
  extends ComponentPropsWithRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

function SheetContent({
  ref,
  side = 'right',
  className,
  children,
  ...props
}: SheetContentProps) {
  useModalContentGlobalSideEffectCleanup();

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        onOpenAutoFocus={(e) => e.preventDefault()}
        {...props}
      >
        <SheetPrimitive.Close
          className="absolute right-4 top-4 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
          tabIndex={-1}
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className,
    )}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

function SheetTitle({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  );
}
SheetTitle.displayName = SheetPrimitive.Title.displayName;

function SheetDescription({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
