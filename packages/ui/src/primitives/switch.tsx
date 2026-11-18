import { cn } from '@genfeedai/helpers';
import { focusRingClassName } from '@ui/primitives/focus-ring';
import { Skeleton } from '@ui/primitives/skeleton';
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field';
import { Switch as SwitchControl, SwitchThumb } from '@ui-sdk/react/switch';
import type {
  ChangeEvent,
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
} from 'react';

type SwitchBaseProps = Omit<
  ComponentPropsWithoutRef<typeof SwitchControl>,
  'checked' | 'disabled' | 'onChange' | 'onCheckedChange'
>;

export type SwitchSize = 'sm' | 'md';

export interface SwitchProps extends SwitchBaseProps {
  checked?: boolean;
  description?: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  /**
   * The saved value is still loading: the label and description render, and a
   * skeleton of the track stands in for the toggle, so it never shows "off"
   * before the real value lands.
   */
  isLoading?: boolean;
  /**
   * Names the switch. Without a `label`, give the switch an `aria-label`: the
   * page agent and screen readers find a control by its name.
   */
  label?: ReactNode;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean) => void;
  size?: SwitchSize;
  switchClassName?: string;
}

/**
 * The track is off by default and `data-checked` turns it on; the thumb travels
 * on a non-overshooting ease-out, colors fade on the standard ease, and
 * pressing an enabled switch stretches the thumb (the checked thumb is
 * re-anchored to the right edge) so the toggle feels physical. Do not center
 * the thumb with flex: translate owns position.
 */
const SWITCH_TRACK_CLASSNAME = cn(
  'group peer inline-flex shrink-0 cursor-pointer items-center justify-start rounded-full border-2 border-transparent bg-muted-foreground transition-colors duration-200',
  'data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50',
  focusRingClassName,
);

const SWITCH_THUMB_CLASSNAME = cn(
  'pointer-events-none block rounded-full bg-background shadow-lg ring-0',
  'data-checked:bg-primary-foreground',
  '[transition:translate_300ms_cubic-bezier(0.32,0.72,0,1),width_200ms_cubic-bezier(0.32,0.72,0,1),background-color_200ms_cubic-bezier(0.32,0.72,0,1)]',
  'motion-reduce:transition-none',
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
    root: 'h-8 w-14',
    thumb: cn(
      'size-7 data-checked:translate-x-6',
      'group-enabled:group-active:w-8 group-enabled:group-active:data-checked:translate-x-5',
    ),
  },
  sm: {
    root: 'h-5 w-9',
    thumb: cn(
      'size-4 data-checked:translate-x-4',
      'group-enabled:group-active:w-5 group-enabled:group-active:data-checked:translate-x-3',
    ),
  },
};

/** The loading track, sized like the toggle it stands in for. */
const SWITCH_SKELETON_CLASSNAMES: Record<SwitchSize, string> = {
  md: 'h-8 w-14',
  sm: 'h-5 w-9',
};

function Switch({
  checked,
  className,
  description,
  isChecked,
  isDisabled,
  isLoading = false,
  label,
  onChange,
  onCheckedChange,
  size = 'sm',
  switchClassName,
  ...props
}: SwitchProps): ReactElement {
  const resolvedChecked = checked ?? isChecked ?? false;
  const sizeClassNames = SWITCH_SIZE_CLASSNAMES[size];
  const switchElement = isLoading ? (
    <Skeleton
      aria-label={props['aria-label']}
      className={SWITCH_SKELETON_CLASSNAMES[size]}
      variant="circular"
    />
  ) : (
    <SwitchControl
      {...props}
      checked={resolvedChecked}
      className={cn(
        SWITCH_TRACK_CLASSNAME,
        sizeClassNames.root,
        switchClassName,
        className,
      )}
      disabled={isDisabled}
      onCheckedChange={(nextChecked) => {
        onCheckedChange?.(nextChecked);
        onChange?.({
          target: { checked: nextChecked },
        } as ChangeEvent<HTMLInputElement>);
      }}
    >
      <SwitchThumb
        className={cn(SWITCH_THUMB_CLASSNAME, sizeClassNames.thumb)}
      />
    </SwitchControl>
  );

  if (!label && !description) {
    return switchElement;
  }

  // A caller's own accessible name wins: the label and description are then
  // plain text beside the switch, as with a native control that has an
  // `aria-label`. Otherwise the field names the switch from its label and
  // description, so clicking the label toggles it without a native <label>
  // wrapper. Label/description left, control right, centered on the row.
  const hasOwnName = Boolean(props['aria-label'] || props['aria-labelledby']);
  const LabelText = hasOwnName ? 'span' : FieldLabel;
  const DescriptionText = hasOwnName ? 'span' : FieldDescription;
  const Row = hasOwnName ? 'div' : Field;

  return (
    <Row className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {label ? (
          <LabelText className="text-sm font-medium text-foreground">
            {label}
          </LabelText>
        ) : null}
        {description ? (
          <DescriptionText className="text-xs text-muted-foreground">
            {description}
          </DescriptionText>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">{switchElement}</div>
    </Row>
  );
}
Switch.displayName = 'Switch';

export { Switch };
