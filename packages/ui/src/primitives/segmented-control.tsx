'use client';

import { cn } from '@genfeedai/helpers';
import {
  SegmentedControlItem,
  SegmentedControl as SegmentedRadioGroup,
} from '@ui-sdk/react/segmented-control';
import { Toggle, ToggleGroup } from '@ui-sdk/react/toggle';
import type { VariantProps } from 'class-variance-authority';
import type { ReactElement, ReactNode } from 'react';
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

  const itemClassName = segmentedItemVariants({
    appearance,
    isFullWidth,
    size,
  });
  const listClassName = cn(
    segmentedListVariants({ appearance, isFullWidth, size }),
    className,
  );
  const withTooltip = (
    option: SegmentedControlOption<TValue>,
    item: ReactElement,
  ) =>
    option.tooltip ? (
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

  // Single choice that always keeps one option: a radio group, so each option
  // reads as a radio and the arrow keys move the choice.
  if (props.type !== 'multiple' && !props.isDeselectable) {
    const { onValueChange } = props;
    return (
      <SegmentedRadioGroup
        aria-label={ariaLabel}
        className={listClassName}
        data-testid={testId}
        disabled={isDisabled}
        onValueChange={(next) => {
          // ui-sdk reports null when code clears the group; the owner of the
          // value already knows.
          if (next !== null) {
            onValueChange(next);
          }
        }}
        value={props.value ?? null}
      >
        {options.map((option) =>
          withTooltip(
            option,
            <SegmentedControlItem
              aria-label={option.ariaLabel}
              className={itemClassName}
              data-testid={option.testId}
              disabled={option.isDisabled}
              key={option.value}
              value={option.value}
            >
              {option.icon}
              {option.label}
            </SegmentedControlItem>,
          ),
        )}
      </SegmentedRadioGroup>
    );
  }

  // Several options at once, or one that can be pressed again to clear: toggle
  // buttons that each report whether they are pressed.
  const isMultiple = props.type === 'multiple';
  const pressed = isMultiple
    ? [...props.value]
    : props.value === undefined
      ? []
      : [props.value];
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      className={listClassName}
      data-testid={testId}
      deselectable={isMultiple ? undefined : true}
      disabled={isDisabled}
      multiple={isMultiple}
      onValueChange={(next) => {
        if (props.type === 'multiple') {
          // ui-sdk reports the pressed values in option order. Callers read the
          // order as the order the person chose in (export columns, say), so
          // keep the kept values where they were and append the new ones.
          const kept = props.value.filter((entry) => next.includes(entry));
          const added = next.filter((entry) => !props.value.includes(entry));
          props.onValueChange([...kept, ...added]);
          return;
        }
        if (props.isDeselectable) {
          props.onValueChange(next[0]);
        }
      }}
      value={pressed}
    >
      {options.map((option) =>
        withTooltip(
          option,
          <Toggle
            aria-label={option.ariaLabel}
            className={itemClassName}
            data-testid={option.testId}
            disabled={option.isDisabled}
            key={option.value}
            value={option.value}
          >
            {option.icon}
            {option.label}
          </Toggle>,
        ),
      )}
    </ToggleGroup>
  );
}

export { SegmentedControl };
