import { cn } from '@genfeedai/helpers';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import type {
  ChangeEvent,
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
} from 'react';

type SwitchBaseProps = Omit<
  ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
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
  ref?: React.Ref<HTMLButtonElement>;
  switchClassName?: string;
}

/**
 * Force semantic track/thumb contrast + travel off parent `data-state` so
 * on/off always slides left ↔ right in both Light and Dark. Do not center the
 * thumb with flex — translate owns position.
 */
const SWITCH_CONTRAST_CLASSNAME = cn(
  'justify-start',
  'data-[state=unchecked]:!bg-muted-foreground data-[state=checked]:!bg-primary',
  'data-[state=unchecked]:[&>span]:!translate-x-0.5',
  'data-[state=checked]:[&>span]:!translate-x-4',
  'data-[state=unchecked]:[&>span]:!bg-background',
  'data-[state=checked]:[&>span]:!bg-primary-foreground',
  '[&>span]:!transition-transform [&>span]:!duration-200 [&>span]:!ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
);

function Switch({
  ref,
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
}: SwitchProps): ReactElement {
  const resolvedChecked = checked ?? isChecked ?? false;
  const switchElement = (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SWITCH_CONTRAST_CLASSNAME,
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
      <SwitchPrimitives.Thumb className="pointer-events-none block size-4 rounded-full shadow-lg ring-0 transition-transform" />
    </SwitchPrimitives.Root>
  );

  if (!label && !description) {
    return switchElement;
  }

  // Never wrap a role=switch button in <label>/<fieldset>: the browser
  // re-activates the control and Radix fires onCheckedChange twice (true then
  // false) — controlled toggles look stuck. Text is non-interactive; switch
  // owns the click.
  // Label/description left, control right — vertically centered on the row.
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
      <div className="flex shrink-0 items-center">{switchElement}</div>
    </div>
  );
}
Switch.displayName = SwitchPrimitives.Root.displayName ?? 'Switch';

export { Switch };
