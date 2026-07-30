import { Switch as ShipSwitch } from '@shipshitdev/ui/primitives';
import type {
  ChangeEvent,
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
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
  ref?: React.Ref<HTMLButtonElement>;
  switchClassName?: string;
}

/**
 * Ship Switch defaults use `bg-accent` for the ON track and
 * `bg-[var(--text-primary)]` for the OFF thumb. In Genfeed studio, `--accent`
 * is remapped to a hover *surface*, so stock colors collapse. Worse: if the
 * thumb’s `translate-x-*` utilities don’t land, the track is `items-center`
 * and the knob sits dead-center for both states — looks “stuck”.
 *
 * Force track color + thumb travel off parent `data-state` so on/off always
 * slides left ↔ right.
 */
const SWITCH_CONTRAST_CLASSNAME = cn(
  // Track — left-align the thumb so translate (not flex centering) owns position
  'justify-start',
  'data-[state=unchecked]:!bg-white/15 data-[state=checked]:!bg-white',
  // Thumb motion (Ship renders one direct span child with its own data-state)
  'data-[state=unchecked]:[&>span]:!translate-x-0.5',
  'data-[state=checked]:[&>span]:!translate-x-4',
  'data-[state=unchecked]:[&>span]:!bg-white',
  'data-[state=checked]:[&>span]:!bg-black',
  '[&>span]:!transition-transform [&>span]:!duration-200 [&>span]:!ease-out',
  // Focus
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
    <ShipSwitch
      className={cn(
        'ship-ui',
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
    />
  );

  if (!label && !description) {
    return switchElement;
  }

  // Never wrap a role=switch button in <label>/<fieldset>: the browser
  // re-activates the control and Radix fires onCheckedChange twice (true then
  // false) — controlled toggles look stuck. Text is non-interactive; switch
  // owns the click.
  return (
    <div className="flex items-start gap-3">
      {switchElement}
      <div className="flex min-w-0 flex-col gap-1">
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
    </div>
  );
}
Switch.displayName = ShipSwitch.displayName ?? 'Switch';

export { Switch };
