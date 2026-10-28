'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ContextInspectorProps,
  ContextInspectorWidth,
} from '@genfeedai/props/ui/context-inspector.props';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useId } from 'react';

const WIDTH_CLASS_NAMES: Record<ContextInspectorWidth, string> = {
  full: 'w-full sm:max-w-[100vw]',
  lg: 'w-full sm:max-w-[min(48rem,92vw)]',
  md: 'w-full sm:max-w-[min(36rem,90vw)]',
  xl: 'w-full sm:max-w-[min(72rem,94vw)]',
};

export default function ContextInspector({
  bodyClassName,
  children,
  className,
  description,
  footer,
  headerAction,
  isOpen,
  onCloseAutoFocus,
  onOpenChange,
  title,
  width = 'lg',
}: ContextInspectorProps) {
  const descriptionId = useId();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'overflow-hidden border-l border-border bg-background/95 backdrop-blur-xl',
          WIDTH_CLASS_NAMES[width],
          className,
        )}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => event.preventDefault()}
        placement="right"
      >
        <div className="shrink-0 border-b border-border bg-background/92 px-5 py-4 pr-12 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="min-w-0 text-left">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription id={descriptionId}>
                  {description}
                </DialogDescription>
              ) : null}
            </DialogHeader>
            {headerAction ? (
              <div className="shrink-0">{headerAction}</div>
            ) : null}
          </div>
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border bg-background/92">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
