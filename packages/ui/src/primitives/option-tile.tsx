'use client';

import { cn } from '@genfeedai/helpers';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { VariantProps } from 'class-variance-authority';
import { type ReactNode, useId } from 'react';
import {
  optionTileGroupVariants,
  optionTileVariants,
} from './option-tile.variants';

interface OptionTileGroupBaseProps
  extends VariantProps<typeof optionTileGroupVariants> {
  ariaLabel: string;
  children: ReactNode;
  /** Layout only: width, margin, alignment. */
  className?: string;
  isDisabled?: boolean;
  testId?: string;
}

interface SingleTileSelection<TValue extends string> {
  isDeselectable?: false;
  onValueChange: (value: TValue) => void;
  type?: 'single';
  value: TValue | undefined;
}

interface DeselectableTileSelection<TValue extends string> {
  isDeselectable: true;
  onValueChange: (value: TValue | undefined) => void;
  type?: 'single';
  value: TValue | undefined;
}

interface MultipleTileSelection<TValue extends string> {
  isDeselectable?: never;
  onValueChange: (value: TValue[]) => void;
  type: 'multiple';
  value: readonly TValue[];
}

export type OptionTileGroupProps<TValue extends string = string> =
  OptionTileGroupBaseProps &
    (
      | SingleTileSelection<TValue>
      | DeselectableTileSelection<TValue>
      | MultipleTileSelection<TValue>
    );

/**
 * A group of selectable `OptionTile`s: single choice (radio semantics, one
 * always selected) or multiple choice (independent toggles).
 */
function OptionTileGroup<TValue extends string = string>(
  props: OptionTileGroupProps<TValue>,
) {
  const { ariaLabel, children, className, columns, isDisabled, testId } = props;
  const groupClassName = cn(optionTileGroupVariants({ columns }), className);

  if (props.type === 'multiple') {
    const { onValueChange, value } = props;
    return (
      <ToggleGroupPrimitive.Root
        aria-label={ariaLabel}
        className={groupClassName}
        data-testid={testId}
        disabled={isDisabled}
        onValueChange={(next) => onValueChange(next as TValue[])}
        type="multiple"
        value={[...value]}
      >
        {children}
      </ToggleGroupPrimitive.Root>
    );
  }

  return (
    <ToggleGroupPrimitive.Root
      aria-label={ariaLabel}
      className={groupClassName}
      data-testid={testId}
      disabled={isDisabled}
      onValueChange={(next) => {
        if (props.isDeselectable) {
          props.onValueChange((next || undefined) as TValue | undefined);
          return;
        }
        // Radix reports '' when the active tile is pressed again.
        if (next) {
          props.onValueChange(next as TValue);
        }
      }}
      type="single"
      value={props.value ?? ''}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

export interface OptionTileProps
  extends VariantProps<typeof optionTileVariants> {
  /** Accessible name when the tile text does not describe it. */
  ariaLabel?: string;
  /** Custom content (thumbnails, previews). Rendered after the text slots. */
  children?: ReactNode;
  /** Layout only: width, margin, grid placement. */
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Marks the tile as mid-update for assistive tech (`aria-busy`). */
  isBusy?: boolean;
  isDisabled?: boolean;
  /**
   * Not choosable right now, but still focusable so keyboard and screen
   * reader users can reach the reason in `description`.
   */
  isUnavailable?: boolean;
  testId?: string;
  title?: ReactNode;
  /** Slot at the end of a row tile (a price, a check mark, a badge). */
  trailing?: ReactNode;
  value: string;
}

function OptionTile({
  ariaLabel,
  children,
  className,
  description,
  icon,
  isBusy,
  isDisabled,
  isUnavailable,
  layout,
  size,
  testId,
  title,
  trailing,
  value,
}: OptionTileProps) {
  const descriptionId = useId();
  const hasText = title !== undefined || description !== undefined;
  return (
    <ToggleGroupPrimitive.Item
      aria-busy={isBusy}
      aria-describedby={
        isUnavailable && description !== undefined ? descriptionId : undefined
      }
      aria-disabled={isUnavailable || undefined}
      aria-label={ariaLabel}
      className={cn(optionTileVariants({ layout, size }), className)}
      data-testid={testId}
      disabled={isDisabled}
      onClick={(event) => {
        if (isUnavailable) {
          event.preventDefault();
        }
      }}
      value={value}
    >
      {icon}
      {hasText ? (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title !== undefined ? (
            <span className="text-sm font-medium text-foreground">{title}</span>
          ) : null}
          {description !== undefined ? (
            <span
              className="text-xs text-muted-foreground"
              id={isUnavailable ? descriptionId : undefined}
            >
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
      {children}
      {trailing}
    </ToggleGroupPrimitive.Item>
  );
}

export { OptionTile, OptionTileGroup };
