'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  AccountPickerItem,
  AccountPickerProps,
} from '@genfeedai/props/ui/display/connected-account.props';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import ConnectedAccountAvatar from './ConnectedAccountAvatar';
import { getConnectedAccountText } from './connected-account.util';

const ITEM_CLASS_NAME =
  'relative inline-flex shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity duration-200 hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-30 aria-checked:opacity-100 aria-checked:ring-2 aria-checked:ring-primary aria-checked:ring-offset-2 aria-checked:ring-offset-background aria-pressed:opacity-100 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background';

const ICON_SIZE_CLASS = {
  lg: 'size-12 [&>svg]:size-5',
  md: 'size-10 [&>svg]:size-4',
  sm: 'size-8 [&>svg]:size-3.5',
} as const;

// Two platforms can share a handle, so the platform is part of the name. When
// the account has neither handle nor name the platform already is the name.
function describe(item: AccountPickerItem): string {
  if (item.label) {
    return item.label;
  }
  const { handle, name, platformLabel, primary } =
    getConnectedAccountText(item);
  const base =
    (handle || name) && primary !== platformLabel
      ? `${primary}, ${platformLabel}`
      : primary;
  return item.warning ? `${base}, ${item.warning}` : base;
}

/**
 * Picks connected accounts as a row of avatars: the profile picture with its
 * platform badge, a ring on the chosen ones, the handle on hover and as the
 * accessible name. The chosen state is read from `aria-pressed` and
 * `aria-checked`, never `data-state`: the tooltip trigger overwrites that.
 * Arrow keys move between accounts and space toggles one.
 * Every place that asks "which accounts" renders this, so no caller composes
 * the avatars itself.
 */
export default function AccountPicker(props: AccountPickerProps) {
  const {
    ariaLabel,
    className,
    isDisabled,
    items,
    size = 'md',
    testId,
  } = props;
  const rowClassName = cn('flex flex-wrap items-center gap-3 p-1', className);

  const renderItems = () =>
    items.map((item) => {
      const label = describe(item);
      return (
        <SimpleTooltip key={item.id} label={label}>
          <ToggleGroupPrimitive.Item
            aria-label={label}
            className={ITEM_CLASS_NAME}
            disabled={item.isDisabled}
            value={item.id}
          >
            {item.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  'flex items-center justify-center rounded-full bg-muted text-foreground',
                  ICON_SIZE_CLASS[size],
                )}
              >
                {item.icon}
              </span>
            ) : (
              <ConnectedAccountAvatar account={item} isDecorative size={size} />
            )}
            {item.warning ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border border-background bg-warning"
              />
            ) : null}
          </ToggleGroupPrimitive.Item>
        </SimpleTooltip>
      );
    });

  if (props.type === 'multiple') {
    const { onValueChange, value } = props;
    return (
      <ToggleGroupPrimitive.Root
        aria-label={ariaLabel}
        className={rowClassName}
        data-testid={testId}
        disabled={isDisabled}
        onValueChange={onValueChange}
        type="multiple"
        value={[...value]}
      >
        {renderItems()}
      </ToggleGroupPrimitive.Root>
    );
  }

  return (
    <ToggleGroupPrimitive.Root
      aria-label={ariaLabel}
      className={rowClassName}
      data-testid={testId}
      disabled={isDisabled}
      onValueChange={(next) => {
        if (next) {
          props.onValueChange(next);
        } else if (props.isDeselectable) {
          props.onValueChange(undefined);
        }
      }}
      type="single"
      value={props.value ?? ''}
    >
      {renderItems()}
    </ToggleGroupPrimitive.Root>
  );
}
