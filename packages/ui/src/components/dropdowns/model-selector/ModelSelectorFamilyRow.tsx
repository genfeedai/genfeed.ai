'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorFamilyRowProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import ModelAvatar from '@ui/models/ModelAvatar';
import { CommandItem } from '@ui/primitives/command';
import { Check, ChevronDown } from 'lucide-react';
import { type ReactNode, useRef } from 'react';

/** A click that follows a handled pointer press within this window is the same gesture. */
const POINTER_GESTURE_MS = 500;

/** The row's cmdk value; the model list reads the prefix to handle arrow keys. */
export const MODEL_FAMILY_ROW_VALUE_PREFIX = 'family:';

/**
 * One family of sibling models as a single expandable row: provider mark,
 * family name, how many models are inside, and a chevron. Expanding it lists
 * the variants as ordinary model rows (`children`) indented under a guide
 * line. A collapsed family that holds the selected model keeps a check so the
 * current choice never disappears from view.
 */
export default function ModelSelectorFamilyRow({
  children,
  familyKey,
  familyLabel,
  isExpanded,
  isSelected,
  onToggle,
  options,
}: ModelSelectorFamilyRowProps & { children?: ReactNode }) {
  const { model } = options[0];
  const lastPointerToggleRef = useRef(0);

  return (
    <>
      <CommandItem
        aria-expanded={isExpanded}
        className={cn(
          'flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-1.5 py-0.5 text-xs text-foreground transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
          isSelected && !isExpanded && 'bg-background-tertiary',
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // Same as the Auto rows: cmdk can swallow the first pointer click
          // inside a Radix popover before onSelect fires. A toggle is not
          // idempotent like Auto's setters, so onSelect skips its own echo.
          event.preventDefault();
          lastPointerToggleRef.current = Date.now();
          onToggle(familyKey);
        }}
        onSelect={() => {
          // The click that ends a pointer press also selects the row; it must
          // not toggle the family a second time and close what just opened.
          if (Date.now() - lastPointerToggleRef.current < POINTER_GESTURE_MS) {
            return;
          }
          onToggle(familyKey);
        }}
        value={`${MODEL_FAMILY_ROW_VALUE_PREFIX}${familyKey}`}
      >
        <ModelAvatar
          isCategoryVisible={false}
          isProviderVisible={false}
          model={model}
        />
        <div className="pointer-events-none flex size-5 shrink-0 items-center justify-center">
          {isSelected && !isExpanded ? (
            <Check aria-hidden className="size-3.5 text-foreground" />
          ) : (
            <span aria-hidden className="size-3.5" />
          )}
        </div>
        <span className="min-w-0 flex-1 truncate font-medium">
          {familyLabel}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {options.length}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180',
          )}
        />
      </CommandItem>
      {isExpanded ? (
        <div className="ml-6 border-l border-border pl-1">{children}</div>
      ) : null}
    </>
  );
}
