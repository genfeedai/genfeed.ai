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

export type SwitchSize = 'sm' | 'md';

export interface SwitchProps extends SwitchBaseProps {
  checked?: boolean;
  description?: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  label?: ReactNode;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean) => void;
  ref?: React.Ref<HTMLButtonElement>;
  size?: SwitchSize;
  switchClassName?: string;
}

/**
 * Force semantic track/thumb contrast + travel off parent `data-state` so
 * on/off always slides left ↔ right in both Light and Dark. Do not center the
 * thumb with flex — translate owns position.
 *
 * Motion: the thumb travels with a slight spring overshoot, colors fade on the
 * standard ease, and pressing an enabled switch stretches the thumb (the
 * checked thumb is re-anchored to the right edge) so the toggle feels physical.
 */
const SWITCH_CONTRAST_CLASSNAME = cn(
  'justify-start',
  'data-[state=unchecked]:!bg-muted-foreground data-[state=checked]:!bg-primary',
  'data-[state=unchecked]:[&>span]:!translate-x-0',
  'data-[state=unchecked]:[&>span]:!bg-background',
  'data-[state=checked]:[&>span]:!bg-primary-foreground',
  '[&>span]:![transition:translate_300ms_cubic-bezier(0.32,0.72,0,1),width_200ms_cubic-bezier(0.32,0.72,0,1),background-color_200ms_cubic-bezier(0.32,0.72,0,1)]',
  'motion-reduce:[&>span]:!transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
);

/**
 * Per-size geometry. The thumb fills the track's inner height and travels the
 * inner width minus itself; pressing widens it by 4px and pulls the checked
 * thumb back by the same 4px. Class strings stay literal so Tailwind sees them.
 */
const SWITCH_SIZE_CLASSNAMES: Record<
  SwitchSize,
  { root: string; thumb: string }
> = {
  md: {
    root: cn(
      'h-8 w-14',
      'data-[state=checked]:[&>span]:!translate-x-6',
      'enabled:active:[&>span]:!w-8 data-[state=checked]:enabled:active:[&>span]:!translate-x-5',
    ),
    thumb: 'size-7',
  },
  sm: {
    root: cn(
      'h-5 w-9',
      'data-[state=checked]:[&>span]:!translate-x-4',
      'enabled:active:[&>span]:!w-5 data-[state=checked]:enabled:active:[&>span]:!translate-x-3',
    ),
    thumb: 'size-4',
  },
};

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
  size = 'sm',
  switchClassName,
  ...props
}: SwitchProps): ReactElement {
  const resolvedChecked = checked ?? isChecked ?? false;
  const sizeClassNames = SWITCH_SIZE_CLASSNAMES[size];
  const switchElement = (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        sizeClassNames.root,
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
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block rounded-full shadow-lg ring-0',
          sizeClassNames.thumb,
        )}
      />
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
