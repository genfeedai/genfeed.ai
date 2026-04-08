import type { ChangeEvent, ReactElement } from 'react';
import { useCallback } from 'react';
import {
  type Control,
  type FieldValues,
  type Path,
  useController,
} from 'react-hook-form';
import { cn } from '../lib/utils';
import { Slider } from './slider';

export interface RangeFieldProps<T extends FieldValues = FieldValues> {
  name?: Path<T> | string;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  showValue?: boolean;
  showLabels?: boolean;
  minLabel?: string;
  maxLabel?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  control?: Control<T>;
}

type RangeRenderFieldProps = {
  name: string;
  value?: number;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

function RangeFieldInner<T extends FieldValues = FieldValues>({
  name = '',
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
  fieldProps,
}: Omit<RangeFieldProps<T>, 'control'> & {
  fieldProps?: RangeRenderFieldProps;
}): ReactElement {
  const renderRangeInput = useCallback(
    (controllerFieldProps?: RangeRenderFieldProps) => {
      const currentValue = controllerFieldProps?.value ?? value ?? 0;

      const handleValueChange = (values: number[]) => {
        const newValue = values[0];
        const syntheticEvent = {
          currentTarget: { name, value: String(newValue) },
          target: { name, value: String(newValue) },
        } as unknown as ChangeEvent<HTMLInputElement>;

        controllerFieldProps?.onChange?.(syntheticEvent);
        onChange(syntheticEvent);
      };

      return (
        <div className="w-full">
          {label && (
            <label className="mb-1 flex items-center justify-between text-sm font-medium">
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
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-foreground/60">{minLabel || min}</span>
                <span className="text-foreground/60">{maxLabel || max}</span>
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      className,
      isDisabled,
      isRequired,
      label,
      max,
      maxLabel,
      min,
      minLabel,
      name,
      onChange,
      showLabels,
      showValue,
      step,
      value,
    ],
  );

  return renderRangeInput(fieldProps);
}

function HookedRangeField<T extends FieldValues = FieldValues>({
  control,
  ...props
}: RangeFieldProps<T> & {
  control: NonNullable<RangeFieldProps<T>['control']>;
}): ReactElement {
  const { field } = useController({
    control,
    name: props.name as Path<T>,
  });

  return (
    <RangeFieldInner
      {...props}
      fieldProps={{
        name: field.name,
        onChange: field.onChange,
        value:
          typeof field.value === 'number'
            ? field.value
            : Number(field.value ?? props.value ?? 0),
      }}
    />
  );
}

export default function RangeField<T extends FieldValues = FieldValues>({
  control,
  ...props
}: RangeFieldProps<T>): ReactElement {
  if (control && props.name) {
    return <HookedRangeField {...props} control={control} />;
  }

  return <RangeFieldInner {...props} />;
}
