'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  createContext,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useContext,
} from 'react';
import { HiXMark as X } from 'react-icons/hi2';

/**
 * Compound Modal Component
 *
 * Provides a slot-based API for building modals with consistent styling.
 * Uses Radix UI Dialog primitives under the hood.
 *
 * @example
 * ```tsx
 * <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
 *   <Modal.Content size="md">
 *     <Modal.Header>
 *       <Modal.Title>Confirm Action</Modal.Title>
 *       <Modal.Description>This action cannot be undone.</Modal.Description>
 *     </Modal.Header>
 *
 *     <Modal.Body>
 *       <p>Are you sure you want to continue?</p>
 *     </Modal.Body>
 *
 *     <Modal.Footer>
 *       <Modal.CloseButton asChild>
 *         <Button variant="outline">Cancel</Button>
 *       </Modal.CloseButton>
 *       <Button variant="destructive" onClick={handleConfirm}>Confirm</Button>
 *     </Modal.Footer>
 *   </Modal.Content>
 * </Modal.Root>
 * ```
 */

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE_CLASSES: Record<ModalSize, string> = {
  full: 'max-w-[95vw] h-[90vh]',
  lg: 'max-w-2xl',
  md: 'max-w-lg',
  sm: 'max-w-sm',
  xl: 'max-w-4xl',
};

interface ModalContextValue {
  size: ModalSize;
}

const ModalContext = createContext<ModalContextValue>({ size: 'md' });

const useModalContext = () => useContext(ModalContext);

// Root
const ModalRoot = DialogPrimitive.Root;

// Trigger
const ModalTrigger = DialogPrimitive.Trigger;

// Portal
const ModalPortal = DialogPrimitive.Portal;

// Overlay
const ModalOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
ModalOverlay.displayName = 'Modal.Overlay';

// Content
interface ModalContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: ModalSize;
  showCloseButton?: boolean;
}

const ModalContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(
  (
    { className, children, size = 'md', showCloseButton = true, ...props },
    ref,
  ) => (
    <ModalPortal>
      <ModalOverlay />
      <ModalContext.Provider value={{ size }}>
        <DialogPrimitive.Content
          ref={ref}
          aria-describedby={props['aria-describedby'] ?? undefined}
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%]',
            'gap-4 rounded-lg border border-border bg-card text-card-foreground p-6 shadow-lg duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            '',
            SIZE_CLASSES[size],
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              className={cn(
                'absolute right-4 top-4 opacity-70 ring-offset-background',
                'transition-opacity hover:opacity-100 focus:outline-none',
                'focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:pointer-events-none data-[state=open]:bg-accent',
                'data-[state=open]:text-muted-foreground',
              )}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </ModalContext.Provider>
    </ModalPortal>
  ),
);
ModalContent.displayName = 'Modal.Content';

// Header
interface ModalHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        className,
      )}
      {...props}
    />
  ),
);
ModalHeader.displayName = 'Modal.Header';

// Title
const ModalTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className,
    )}
    {...props}
  />
));
ModalTitle.displayName = 'Modal.Title';

// Description
const ModalDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
ModalDescription.displayName = 'Modal.Description';

// Body - scrollable content area
interface ModalBodyProps extends HTMLAttributes<HTMLDivElement> {
  scrollable?: boolean;
}

const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(
  ({ className, scrollable = false, ...props }, ref) => {
    const { size } = useModalContext();
    const isFullSize = size === 'full';

    return (
      <div
        ref={ref}
        className={cn(
          'py-4',
          (scrollable || isFullSize) && 'flex-1 overflow-y-auto',
          className,
        )}
        {...props}
      />
    );
  },
);
ModalBody.displayName = 'Modal.Body';

// Footer
const ModalFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  ),
);
ModalFooter.displayName = 'Modal.Footer';

// Close Button
const ModalCloseButton = DialogPrimitive.Close;
ModalCloseButton.displayName = 'Modal.CloseButton';

/**
 * Compound Modal export
 *
 * Usage: Modal.Root, Modal.Content, Modal.Header, etc.
 */
export const Modal = {
  Body: ModalBody,
  CloseButton: ModalCloseButton,
  Content: ModalContent,
  Description: ModalDescription,
  Footer: ModalFooter,
  Header: ModalHeader,
  Overlay: ModalOverlay,
  Portal: ModalPortal,
  Root: ModalRoot,
  Title: ModalTitle,
  Trigger: ModalTrigger,
};

export type { ModalBodyProps, ModalContentProps, ModalSize };
