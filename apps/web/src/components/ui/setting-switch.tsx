'use client';

import { cn } from '@genfeedai/helpers';
import { focusRingClassName } from '@ui/primitives/focus-ring';
import { Skeleton } from '@ui/primitives/skeleton';
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field';
import { Switch, SwitchThumb } from '@ui-sdk/react/switch';
import type { ReactElement } from 'react';

export interface SettingSwitchProps {
  description?: string;
  isChecked: boolean;
  isDisabled?: boolean;
  /**
   * The saved value is still loading: the label and description render, and a
   * skeleton of the track stands in for the toggle, so it never shows "off"
   * before the real value lands.
   */
  isLoading?: boolean;
  label: string;
  onCheckedChange: (isChecked: boolean) => void;
}

/**
 * A setting that saves as soon as it changes: label and description on the
 * left, the switch on the right. Built on ui-sdk so the field names the switch
 * and an agent bridge can find it by that name and call `setChecked`. It looks
 * and moves like `Switch` from `@ui/primitives/switch` at its default size.
 */
export default function SettingSwitch({
  description,
  isChecked,
  isDisabled = false,
  isLoading = false,
  label,
  onCheckedChange,
}: SettingSwitchProps): ReactElement {
  return (
    <Field className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <FieldLabel className="text-sm font-medium text-foreground">
          {label}
        </FieldLabel>
        {description ? (
          <FieldDescription className="text-xs text-muted-foreground">
            {description}
          </FieldDescription>
        ) : null}
      </div>
      {isLoading ? (
        <Skeleton aria-label={label} className="h-5 w-9" variant="circular" />
      ) : (
        <Switch
          checked={isChecked}
          className={cn(
            'group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-start rounded-full border-2 border-transparent bg-muted-foreground transition-colors duration-200',
            'data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50',
            focusRingClassName,
          )}
          disabled={isDisabled}
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked)}
        >
          <SwitchThumb
            className={cn(
              'pointer-events-none block size-4 rounded-full bg-background shadow-lg',
              'data-checked:translate-x-4 data-checked:bg-primary-foreground',
              'group-enabled:group-active:w-5 group-enabled:group-active:data-checked:translate-x-3',
              '[transition:translate_300ms_cubic-bezier(0.32,0.72,0,1),width_200ms_cubic-bezier(0.32,0.72,0,1),background-color_200ms_cubic-bezier(0.32,0.72,0,1)]',
              'motion-reduce:transition-none',
            )}
          />
        </Switch>
      )}
    </Field>
  );
}
