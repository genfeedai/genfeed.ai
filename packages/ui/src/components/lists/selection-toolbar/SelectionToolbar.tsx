'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { SelectionToolbarProps } from '@genfeedai/props/ui/display/selection-toolbar.props';
import { Button } from '@ui/primitives/button';
import { X } from 'lucide-react';

export default function SelectionToolbar({
  count,
  label,
  onClear,
  clearLabel = 'Clear selection',
  children,
}: SelectionToolbarProps) {
  return (
    <div
      role="group"
      aria-label={count > 0 ? 'Selection actions' : undefined}
      className={
        count > 0
          ? 'sticky top-4 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-card px-4 py-3 shadow-border'
          : 'sr-only'
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        <span role="status" className="text-sm font-semibold text-foreground">
          {count > 0 ? label : ''}
        </span>
        {count > 0 && (
          <Button
            ariaLabel={clearLabel}
            tooltip={clearLabel}
            icon={<X className="size-4" />}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={onClear}
          />
        )}
      </div>
      {count > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
