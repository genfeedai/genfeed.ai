'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioGenerateSettingsPopoverProps } from '@genfeedai/props/studio/studio-generate.props';
import {
  STUDIO_ASPECT_RATIOS,
  STUDIO_MAX_OUTPUTS,
} from '@pages/studio/generate/utils/studio-generate-settings';
import {
  clampRemixDurationSeconds,
  REMIX_MAX_DURATION_SECONDS,
  REMIX_MIN_DURATION_SECONDS,
} from '@pages/studio/generate/utils/studio-remix-run';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  EMPTY_SELECT_ITEM_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

/** Value used by every "no element picked" option — Radix rejects `''`. */
const NONE_VALUE = EMPTY_SELECT_ITEM_VALUE;

export function getRemixAspectRatioOptions(current: string) {
  return Array.from(new Set([current, ...STUDIO_ASPECT_RATIOS])).map(
    (ratio) => ({ label: ratio, value: ratio }),
  );
}

export function describeRemixOutputSettings(
  settings: StudioGenerateSettingsPopoverProps['settings'],
  type: StudioGenerateSettingsPopoverProps['type'],
): string {
  return [
    settings.aspectRatio,
    type === 'video' || type === 'avatar'
      ? settings.duration
        ? `${settings.duration}s`
        : null
      : null,
    `${settings.outputs}x`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function SettingRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="w-44 shrink-0">{children}</div>
    </div>
  );
}

export function OptionSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  isDisabled?: boolean;
  onChange: (value: string | undefined) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  placeholder: string;
  value: string | undefined;
}): ReactElement {
  return (
    <Select
      disabled={isDisabled}
      onValueChange={(next) => onChange(next === NONE_VALUE ? undefined : next)}
      value={value || NONE_VALUE}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Output-only settings chip for Remix runs. The full Unified Generation
 * Setup popover (`GenerationSetupPopover`) drives every other Studio
 * surface; Remix keeps this narrower, output-only variant because a Remix
 * run only ever touches aspect ratio, duration, and output count — the
 * source ingredient owns Look, Identity, and Brand.
 */
export default function StudioGenerateSettingsPopover({
  isDisabled = false,
  onChange,
  onReset,
  settings,
  type,
}: StudioGenerateSettingsPopoverProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const hasDuration = type === 'video' || type === 'avatar';
  const summary = describeRemixOutputSettings(settings, type);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Generation settings"
          className={cn(
            'gap-1.5 border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent/50',
            SHELL_CONTROL_HEIGHT_CLASS,
          )}
          icon={<Settings2 className="size-3.5" />}
          isDisabled={isDisabled}
          label={summary}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverPanelContent align="start" className="w-80 p-3" side="top">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {translate('remixOutput.title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate('remixOutput.description')}
            </p>
          </div>
          <SettingRow label="Aspect ratio">
            <OptionSelect
              ariaLabel="Aspect ratio"
              onChange={(value) =>
                onChange({ aspectRatio: value || settings.aspectRatio })
              }
              options={getRemixAspectRatioOptions(settings.aspectRatio)}
              placeholder="Aspect ratio"
              value={settings.aspectRatio}
            />
          </SettingRow>
          {hasDuration ? (
            <SettingRow label="Duration">
              <Input
                aria-label="Duration"
                className={SHELL_CONTROL_HEIGHT_CLASS}
                max={REMIX_MAX_DURATION_SECONDS}
                min={REMIX_MIN_DURATION_SECONDS}
                onChange={(event) => {
                  onChange({
                    duration: clampRemixDurationSeconds(event.target.value),
                  });
                }}
                type="number"
                value={settings.duration ?? ''}
              />
            </SettingRow>
          ) : null}
          <SettingRow label="Outputs">
            <OptionSelect
              ariaLabel="Number of outputs"
              onChange={(value) =>
                onChange({ outputs: value ? Number(value) : 1 })
              }
              options={Array.from(
                { length: STUDIO_MAX_OUTPUTS },
                (_unused, index) => ({
                  label: `${index + 1}x`,
                  value: String(index + 1),
                }),
              )}
              placeholder="1x"
              value={String(settings.outputs)}
            />
          </SettingRow>
          <div className="flex justify-end border-t border-border pt-2">
            <Button
              className="px-2 text-xs"
              label="Reset"
              onClick={onReset}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
