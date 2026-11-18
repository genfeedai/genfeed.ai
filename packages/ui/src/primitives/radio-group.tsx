'use client';

import { cn } from '@genfeedai/helpers';
import { focusRingClassName } from '@ui/primitives/focus-ring';
import {
  Radio,
  RadioGroup as RadioGroupControl,
  RadioIndicator,
} from '@ui-sdk/react/radio';
import { Circle } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';

export type RadioGroupProps = Omit<
  ComponentPropsWithRef<typeof RadioGroupControl>,
  'onValueChange'
> & {
  onValueChange?: (value: string) => void;
};

/**
 * A group of radios that keeps one value. Give it an accessible name (a
 * `Field` label or an `aria-label`): the page agent and screen readers find
 * the group by that name.
 */
function RadioGroup({ className, onValueChange, ...props }: RadioGroupProps) {
  return (
    <RadioGroupControl
      className={cn('grid gap-2', className)}
      onValueChange={(next) => {
        // A person cannot clear a radio group; only the page's own code can,
        // and the owner of the value already knows.
        if (next !== null) {
          onValueChange?.(next);
        }
      }}
      {...props}
    />
  );
}
RadioGroup.displayName = 'RadioGroup';

function RadioGroupItem({
  className,
  ...props
}: ComponentPropsWithRef<typeof Radio>) {
  return (
    <Radio
      className={cn(
        'aspect-square size-4 cursor-pointer rounded-full border border-primary text-primary shadow',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        focusRingClassName,
        className,
      )}
      {...props}
    >
      <RadioIndicator className="flex items-center justify-center">
        <Circle aria-hidden="true" className="size-3.5 fill-primary" />
      </RadioIndicator>
    </Radio>
  );
}
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
