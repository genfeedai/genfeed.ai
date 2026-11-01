'use client';

import { cn } from '@genfeedai/helpers';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import ButtonTooltip from './button-tooltip';
import {
  segmentedItemVariants,
  segmentedListVariants,
} from './segmented-control.variants';

export interface SegmentedControlOption<TValue extends string = string> {
  /** Accessible name when the option has no text (icon-only options). */
  ariaLabel?: string;
  icon?: ReactNode;
  isDisabled?: boolean;
  label?: ReactNode;
  testId?: string;
  /** Hint shown on hover and focus; use it instead of a native `title`. */
  tooltip?: string;
  value: TValue;
}

interface SegmentedControlBaseProps<TValue extends string>
  extends VariantProps<typeof segmentedListVariants> {
  ariaLabel: string;
  /** Layout only: width, margin, alignment. */
  className?: string;
  isDisabled?: boolean;
  options: readonly SegmentedControlOption<TValue>[];
  testId?: string;
}

interface SingleSelection<TValue extends string> {
  isDeselectable?: false;
  onValueChange: (value: TValue) => void;
  type?: 'single';
  value: TValue | undefined;
}

interface DeselectableSelection<TValue extends string> {
  isDeselectable: true;
  onValueChange: (value: TValue | undefined) => void;
  type?: 'single';
  value: TValue | undefined;
}

interface MultipleSelection<TValue extends string> {
  isDeselectable?: never;
  onValueChange: (value: TValue[]) => void;
  type: 'multiple';
  value: readonly TValue[];
}

export type SegmentedControlProps<TValue extends string = string> =
  SegmentedControlBaseProps<TValue> &
    (
      | SingleSelection<TValue>
      | DeselectableSelection<TValue>
      | MultipleSelection<TValue>
    );

/**
 * A data-driven choice control: a joined bar of segments (`appearance`
 * "segmented", the default) or a row of chips (`appearance` "chip").
 *
 * Single mode always keeps one option selected unless `isDeselectable` is set.
 * Multiple mode toggles each option independently.
 */
function SegmentedControl<TValue extends string = string>(
  props: SegmentedControlProps<TValue>,
) {
  const {
    appearance,
    ariaLabel,
    className,
    isDisabled,
    isFullWidth,
    options,
    size,
    testId,
  } = props;

  const items = options.map((option) => {
    const item = (
      <ToggleGroupPrimitive.Item
        aria-label={option.ariaLabel}
        className={segmentedItemVariants({ appearance, isFullWidth, size })}
        data-testid={option.testId}
        disabled={option.isDisabled}
        key={option.value}
        value={option.value}
      >
        {option.icon}
        {option.label}
      </ToggleGroupPrimitive.Item>
    );
    return option.tooltip ? (
      <ButtonTooltip
        key={option.value}
        label={option.tooltip}
        position="bottom"
      >
        {item}
      </ButtonTooltip>
    ) : (
      item
    );
  });

  const listClassName = cn(
    segmentedListVariants({ appearance, isFullWidth, size }),
    className,
  );

  if (props.type === 'multiple') {
    const { onValueChange, value } = props;
    return (
      <ToggleGroupPrimitive.Root
        aria-label={ariaLabel}
        className={listClassName}
        data-testid={testId}
        disabled={isDisabled}
        onValueChange={(next) => onValueChange(next as TValue[])}
        type="multiple"
        value={[...value]}
      >
        {items}
      </ToggleGroupPrimitive.Root>
    );
  }

  return (
    <ToggleGroupPrimitive.Root
      aria-label={ariaLabel}
      className={listClassName}
      data-testid={testId}
      disabled={isDisabled}
      onValueChange={(next) => {
        if (props.isDeselectable) {
          props.onValueChange((next || undefined) as TValue | undefined);
          return;
        }
        // Radix reports '' when the active item is pressed again.
        if (next) {
          props.onValueChange(next as TValue);
        }
      }}
      type="single"
      value={props.value ?? ''}
    >
      {items}
    </ToggleGroupPrimitive.Root>
  );
}

export { SegmentedControl };
