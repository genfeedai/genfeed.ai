import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormRangeProps } from '@props/forms/form.props';
import BaseFormField from '@ui/forms/base/base-form-field/BaseFormField';
import { Slider } from '@ui/primitives/slider';
import type { ChangeEvent } from 'react';
import { useCallback } from 'react';
import type { FieldValues } from 'react-hook-form';

export default function FormRange<T extends FieldValues>({
  name,
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  className = '',
  isDisabled = false,
  isRequired = false,
  showValue = true,
  showLabels = false,
  minLabel,
  maxLabel,
  onChange = () => {},
  control,
}: FormRangeProps<T>) {
  const renderRangeInput = useCallback(
    (fieldProps?: {
      name: string;
      value: number;
      ref: (el: HTMLInputElement | null) => void;
      onBlur: () => void;
      onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    }) => {
      const currentValue = fieldProps?.value ?? value ?? 0;

      const handleValueChange = (values: number[]) => {
        const newValue = values[0];
        // Build a synthetic change event from slider values.
        const syntheticEvent = {
          currentTarget: { name, value: String(newValue) },
          target: { name, value: String(newValue) },
        } as unknown as ChangeEvent<HTMLInputElement>;

        if (fieldProps) {
          fieldProps.onChange(syntheticEvent);
        }
        onChange(syntheticEvent);
      };

      return (
        <div className="w-full">
          {label && (
            <label className="flex justify-between items-center text-sm font-medium mb-1">
              <span>
                {label}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </span>
              {showValue && (
                <span className="text-foreground/70">{currentValue}</span>
              )}
            </label>
          )}

          <div className="relative">
            <Slider
              value={[currentValue]}
              min={min}
              max={max}
              step={step}
              disabled={isDisabled}
              onValueChange={handleValueChange}
              className={cn('w-full', className)}
            />

            {showLabels && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-foreground/60">{minLabel || min}</span>
                <span className="text-foreground/60">{maxLabel || max}</span>
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      name,
      label,
      value,
      min,
      max,
      step,
      className,
      isDisabled,
      isRequired,
      showValue,
      showLabels,
      minLabel,
      maxLabel,
      onChange,
    ],
  );

  // If control is provided, use BaseFormField (which calls useController unconditionally)
  if (control) {
    return (
      <BaseFormField
        name={name}
        control={control}
        onChange={onChange as ((value: unknown) => void) | undefined}
        render={renderRangeInput}
      />
    );
  }

  // Otherwise, render without react-hook-form integration
  return renderRangeInput();
}
