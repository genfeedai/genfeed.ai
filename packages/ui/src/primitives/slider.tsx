'use client';

import { cn } from '@genfeedai/helpers';
import * as SliderPrimitive from '@radix-ui/react-slider';
import type { ComponentPropsWithRef } from 'react';

function Slider({
  ref,
  className,
  defaultValue,
  value,
  ...props
}: ComponentPropsWithRef<typeof SliderPrimitive.Root>) {
  const thumbCount = Array.isArray(value)
    ? value.length
    : Array.isArray(defaultValue)
      ? defaultValue.length
      : 1;
  const thumbSlots =
    thumbCount > 1 ? (['start', 'end'] as const) : (['value'] as const);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        className,
      )}
      defaultValue={defaultValue}
      value={value}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {thumbSlots.map((slot) => (
        <SliderPrimitive.Thumb
          key={slot}
          className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
