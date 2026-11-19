'use client';

import { cn } from '@genfeedai/helpers';
import {
  SliderControl,
  SliderIndicator,
  Slider as SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider';
import type { ComponentPropsWithRef } from 'react';

export interface SliderProps
  extends Omit<
    ComponentPropsWithRef<'div'>,
    'defaultValue' | 'onChange' | 'value'
  > {
  defaultValue?: number[];
  disabled?: boolean;
  max?: number;
  min?: number;
  /** Runs when a drag or key press settles, not on every step of a drag. */
  onValueCommit?: (value: number[]) => void;
  onValueChange?: (value: number[]) => void;
  step?: number;
  /** One entry for each thumb. */
  value?: number[];
}

/**
 * A slider with one thumb for each entry of `value`. The value is always a
 * list, so a single slider reads `value={[40]}` and `onValueChange={([next]) => …}`.
 * A one-thumb slider is a number slider to ui-sdk, so the page agent sees a
 * number it can set; name it with an `aria-label`.
 */
function Slider({
  ref,
  className,
  defaultValue,
  disabled,
  onValueChange,
  onValueCommit,
  value,
  min = 0,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: SliderProps) {
  const thumbCount = (value ?? defaultValue ?? [min]).length;
  const thumbSlots = Array.from({ length: thumbCount }, (_, slot) => slot);
  const rootClassName = cn(
    'relative flex w-full touch-none select-none items-center',
    className,
  );
  const parts = (
    <SliderControl className="flex h-5 w-full items-center">
      <SliderTrack className="relative h-1.5 w-full grow rounded-full bg-primary/20">
        <SliderIndicator className="rounded-full bg-primary" />
        {thumbSlots.map((slot) => (
          <SliderThumb
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50"
            index={slot}
            key={`thumb-${slot}`}
          />
        ))}
      </SliderTrack>
    </SliderControl>
  );

  if (thumbCount === 1) {
    return (
      <SliderRoot
        {...props}
        className={rootClassName}
        defaultValue={defaultValue?.[0]}
        disabled={disabled}
        min={min}
        onValueChange={(next) => onValueChange?.([next])}
        onValueCommit={(next) => onValueCommit?.([next])}
        ref={ref}
        value={value?.[0]}
      >
        {parts}
      </SliderRoot>
    );
  }

  return (
    <SliderRoot
      {...props}
      className={rootClassName}
      defaultValue={defaultValue}
      disabled={disabled}
      min={min}
      onValueChange={(next) => onValueChange?.(next)}
      onValueCommit={(next) => onValueCommit?.(next)}
      ref={ref}
      value={value}
    >
      {parts}
    </SliderRoot>
  );
}
Slider.displayName = 'Slider';

export { Slider };
