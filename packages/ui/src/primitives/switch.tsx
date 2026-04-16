import * as SwitchPrimitive from '@radix-ui/react-switch';
import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';

type SwitchBaseProps = Omit<
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  'checked' | 'disabled' | 'onChange' | 'onCheckedChange'
>;

export interface SwitchProps extends SwitchBaseProps {
  checked?: boolean;
  description?: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  label?: ReactNode;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean) => void;
  switchClassName?: string;
}

const Switch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(
  (
    {
      checked,
      className,
      description,
      isChecked,
      isDisabled,
      label,
      onChange,
      onCheckedChange,
      switchClassName,
      ...props
    },
    ref,
  ): ReactElement => {
    const resolvedChecked = checked ?? isChecked ?? false;
    const switchElement = (
      <SwitchPrimitive.Root
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:shadow-[0_0_0_1px_rgba(249,115,22,0.18),0_4px_14px_rgba(249,115,22,0.24)] data-[state=unchecked]:hover:border-white/25 data-[state=unchecked]:hover:bg-white/[0.12]',
          switchClassName,
          className,
        )}
        {...props}
        checked={resolvedChecked}
        disabled={isDisabled}
        onCheckedChange={(nextChecked) => {
          onCheckedChange?.(nextChecked);
          onChange?.({
            target: { checked: nextChecked },
          } as ChangeEvent<HTMLInputElement>);
        }}
        ref={ref}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.55)] ring-0 transition-transform duration-200 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-white',
          )}
        />
      </SwitchPrimitive.Root>
    );

    if (!label && !description) {
      return switchElement;
    }

    return (
      <fieldset>
        <label className="flex cursor-pointer items-start gap-3">
          {switchElement}
          <div className="flex flex-col gap-1">
            {label ? (
              <span
                className={cn(
                  'text-sm font-medium transition-colors duration-200',
                  switchClassName &&
                    'peer-data-[state=checked]:text-[var(--accent-orange)]',
                )}
              >
                {label}
              </span>
            ) : null}
            {description ? (
              <span
                className={cn(
                  'text-xs text-muted-foreground transition-colors duration-200',
                  switchClassName &&
                    'peer-data-[state=checked]:text-[color:rgba(255,255,255,0.72)]',
                )}
              >
                {description}
              </span>
            ) : null}
          </div>
        </label>
      </fieldset>
    );
  },
);
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
