import { Switch as ShipSwitch } from '@shipshitdev/ui/primitives';
import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';

type SwitchBaseProps = Omit<
  ComponentPropsWithoutRef<typeof ShipSwitch>,
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

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
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
      <ShipSwitch
        className={cn('ship-ui', switchClassName, className)}
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
      />
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
              <span className={cn('text-sm font-medium text-foreground')}>
                {label}
              </span>
            ) : null}
            {description ? (
              <span className={cn('text-xs text-muted-foreground')}>
                {description}
              </span>
            ) : null}
          </div>
        </label>
      </fieldset>
    );
  },
);
Switch.displayName = ShipSwitch.displayName ?? 'Switch';

export { Switch };
