'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { usePhoneViewport } from '@ui/dropdowns/generation-setup/usePhoneViewport';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import { Popover, PopoverAnchor, PopoverContent } from '@ui/primitives/popover';
import { ChevronRight } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';

/** The Legacy row's cmdk value, so the model list can tell when it is highlighted. */
export const LEGACY_MODELS_ROW_VALUE = 'legacy models';

/** A model family row's cmdk value is this prefix plus the family key. */
export const MODEL_FAMILY_ROW_VALUE_PREFIX = 'family:';

interface GenerationSetupModelFlyoutProps {
  /** Where the flyout sits against its row: `end` grows upward from a last row. */
  align?: 'center' | 'end' | 'start';
  children: ReactNode;
  /** A count or check shown before the chevron. */
  hint?: ReactNode;
  isOpen: boolean;
  label: string;
  /** The mark in front of the label (a family's brand). */
  leading?: ReactNode;
  onOpenChange: (isOpen: boolean) => void;
  /** Rows that are not a plain group of options (Legacy) read quieter. */
  tone?: 'muted' | 'normal';
  value: string;
}

/**
 * One row that opens its models in a flyout to the right, like a cascading
 * menu: "Legacy" for the retired generation, and one per family of sibling
 * models (GPT Image 2, 2.5 Flare...). A last row (Legacy) is bottom-aligned
 * with its flyout so the list grows upward; the last model sits level with the
 * row that opened it. The model list is a cmdk list inside a popover, so
 * Radix's menu submenu cannot be used here; the flyout is a nested popover
 * anchored to the row. Enter, click or the right arrow opens it, Escape or
 * the left arrow closes it. On a phone there is no room beside the list, so
 * the flyout opens over it at the same width.
 */
export default function GenerationSetupModelFlyout({
  align = 'end',
  children,
  hint,
  isOpen,
  label,
  leading,
  onOpenChange,
  tone = 'normal',
  value,
}: GenerationSetupModelFlyoutProps) {
  const isPhoneViewport = usePhoneViewport();
  const rowRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  function handleFlyoutKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // The flyout is portaled but still inside the model list's React tree, so
    // keys the flyout list already handled must not reach the outer list too.
    event.stopPropagation();
    if (event.key !== 'ArrowLeft') return;
    event.preventDefault();
    onOpenChange(false);
  }

  return (
    <Popover
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) onOpenChange(false);
      }}
      open={isOpen}
    >
      <PopoverAnchor asChild>
        <CommandItem
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className={cn(
            'flex min-h-7 cursor-pointer items-center gap-2 px-1.5 py-0.5 text-xs data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
            tone === 'muted'
              ? 'text-muted-foreground'
              : 'min-h-9 text-foreground',
          )}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            // Same as the Auto rows: cmdk can swallow the first pointer click
            // inside a Radix popover before onSelect fires.
            event.preventDefault();
            if (isOpen) onOpenChange(false);
            else onOpenChange(true);
          }}
          onSelect={() => onOpenChange(true)}
          ref={rowRef}
          value={value}
        >
          {leading}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              tone === 'normal' && 'font-medium',
            )}
          >
            {label}
          </span>
          {hint}
          <ChevronRight aria-hidden className="size-3.5 shrink-0" />
        </CommandItem>
      </PopoverAnchor>
      <PopoverContent
        align={align}
        aria-label={label}
        avoidCollisions
        className={cn(
          overlayMenuSurfaceClassName,
          'w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0',
          'max-h-[min(480px,var(--radix-popover-content-available-height,70vh))]',
          isPhoneViewport && 'w-[var(--radix-popover-trigger-width)]',
        )}
        collisionPadding={16}
        onCloseAutoFocus={(event) => {
          // The flyout has no trigger to hand focus back to; keep it in the
          // model search so the keyboard stays where it was.
          event.preventDefault();
          const searchInput = rowRef.current
            ?.closest('[cmdk-root]')
            ?.querySelector<HTMLInputElement>('[cmdk-input]');
          searchInput?.focus();
        }}
        onKeyDown={handleFlyoutKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          flyoutRef.current?.focus();
        }}
        side="right"
        // A phone has no room beside the list: overlap it instead.
        sideOffset={isPhoneViewport ? -(rowRef.current?.offsetWidth ?? 0) : 8}
      >
        <Command
          className="flex min-h-0 flex-col bg-muted text-foreground outline-none"
          label={label}
          ref={flyoutRef}
          shouldFilter={false}
        >
          <CommandList className="max-h-[min(440px,calc(var(--radix-popover-content-available-height,70vh)-1rem))] overflow-x-hidden overflow-y-auto overscroll-contain p-1 [&_[cmdk-item]]:rounded-lg">
            <CommandGroup>{children}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
