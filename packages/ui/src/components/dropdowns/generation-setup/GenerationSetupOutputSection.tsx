'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupOutputSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import {
  GENERATION_SETUP_ASPECT_RATIO_OPTIONS,
  GENERATION_SETUP_DURATION_OPTIONS_SECONDS,
  GENERATION_SETUP_OUTPUTS_OPTIONS,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';

/** Output tab: aspect ratio, duration (video only), and output count. */
export default function GenerationSetupOutputSection({
  capabilities,
  onResetField,
  onSetField,
  reasons,
  setup,
}: GenerationSetupOutputSectionProps) {
  const translate = useTranslations('agent.generationSetup');

  return (
    <div className="flex flex-col gap-3">
      {capabilities.hasAspectRatio ? (
        <GenerationSetupFieldRow
          fieldKey="aspectRatio"
          label="Aspect ratio"
          onReset={onResetField}
          reason={reasons.aspectRatio}
          source={setup.sources.aspectRatio ?? 'agent'}
        >
          <Select
            onValueChange={(value) => onSetField('aspectRatio', value)}
            value={setup.values.aspectRatio}
          >
            <SelectTrigger
              aria-label="Aspect ratio"
              className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
            >
              <SelectValue placeholder="Aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              {GENERATION_SETUP_ASPECT_RATIO_OPTIONS.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GenerationSetupFieldRow>
      ) : null}

      {capabilities.hasDuration ? (
        <GenerationSetupFieldRow
          fieldKey="duration"
          label="Duration"
          onReset={onResetField}
          reason={reasons.duration}
          source={setup.sources.duration ?? 'agent'}
        >
          <Select
            onValueChange={(value) => onSetField('duration', Number(value))}
            value={String(setup.values.duration ?? '')}
          >
            <SelectTrigger
              aria-label="Duration"
              className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
            >
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              {GENERATION_SETUP_DURATION_OPTIONS_SECONDS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {translate('durationSeconds', { seconds })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GenerationSetupFieldRow>
      ) : null}

      {capabilities.hasOutputs ? (
        <GenerationSetupFieldRow
          fieldKey="outputs"
          label="Outputs"
          onReset={onResetField}
          reason={reasons.outputs}
          source={setup.sources.outputs ?? 'agent'}
        >
          <Select
            onValueChange={(value) => onSetField('outputs', Number(value))}
            value={String(setup.values.outputs)}
          >
            <SelectTrigger
              aria-label="Outputs"
              className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
            >
              <SelectValue placeholder="Outputs" />
            </SelectTrigger>
            <SelectContent>
              {GENERATION_SETUP_OUTPUTS_OPTIONS.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GenerationSetupFieldRow>
      ) : null}
    </div>
  );
}
