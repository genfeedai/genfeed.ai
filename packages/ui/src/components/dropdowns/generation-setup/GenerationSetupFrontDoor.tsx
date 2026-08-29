'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupFrontDoorProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupProvenanceDot from '@ui/dropdowns/generation-setup/GenerationSetupProvenanceDot';
import { Button } from '@ui/primitives/button';
import { ChevronRight, Search, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Layer 1 of the popover: the agent's summary of what it picked and why, the
 * preset list (apply = pin), and the entry point into the search layer.
 * Structural sibling of the Customize tabs, but read-only — editing always
 * routes through `onCustomize`.
 */
export default function GenerationSetupFrontDoor({
  capabilities,
  creditQuoteLabel,
  isDisabled = false,
  isPresetsLoading = false,
  models,
  onApplyPreset,
  onCustomize,
  onDeletePreset,
  onSearch,
  presets,
  reasons,
  setup,
  typeOptions,
}: GenerationSetupFrontDoorProps) {
  const translate = useTranslations('agent.generationSetup');
  const typeLabel =
    typeOptions.find((option) => option.value === setup.values.type)?.label ??
    setup.values.type;

  const modelLabel =
    setup.values.modelKey === ''
      ? 'Auto'
      : (models.find((model) => model.key === setup.values.modelKey)?.label ??
        setup.values.modelKey);

  const summaryRows: Array<{ key: string; label: string; value: string }> = [
    { key: 'type', label: 'Type', value: typeLabel },
    { key: 'modelKey', label: 'Model', value: modelLabel },
  ];

  if (capabilities.hasAspectRatio) {
    summaryRows.push({
      key: 'aspectRatio',
      label: 'Aspect ratio',
      value: setup.values.aspectRatio,
    });
  }
  if (capabilities.hasDuration && setup.values.duration) {
    summaryRows.push({
      key: 'duration',
      label: 'Duration',
      value: `${setup.values.duration}s`,
    });
  }
  if (capabilities.hasOutputs) {
    summaryRows.push({
      key: 'outputs',
      label: 'Outputs',
      value: String(setup.values.outputs),
    });
  }
  summaryRows.push({
    key: 'brandingMode',
    label: 'Brand voice',
    value: setup.values.brandingMode === 'brand' ? 'On' : 'Off',
  });
  summaryRows.push({
    key: 'isPromptEnhanceEnabled',
    label: 'Prompt enhance',
    value: setup.values.isPromptEnhanceEnabled ? 'On' : 'Off',
  });

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3">
      <Button
        ariaLabel="Search setup fields"
        className="w-full justify-start gap-2 rounded-md border border-border bg-background-secondary px-2.5 text-xs text-muted-foreground hover:text-foreground"
        icon={<Search className="size-3.5 shrink-0" />}
        isDisabled={isDisabled}
        label="Search fields…"
        onClick={onSearch}
        size={ButtonSize.SM}
        textTransform="none"
        variant={ButtonVariant.SECONDARY}
      />

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background-secondary p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium text-primary text-xs">
            <Sparkles className="size-3.5 shrink-0" />
            {translate('agentPick')}
          </span>
          <Button
            ariaLabel="Customize setup"
            className="h-control-sm gap-1 px-1.5 text-2xs text-muted-foreground hover:text-foreground"
            icon={<ChevronRight className="size-3" />}
            isDisabled={isDisabled}
            label="Customize"
            onClick={onCustomize}
            size={ButtonSize.XS}
            textTransform="none"
            variant={ButtonVariant.GHOST}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {summaryRows.map((row) => (
            <div
              className="flex items-center justify-between gap-3 text-xs"
              key={row.key}
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <GenerationSetupProvenanceDot
                  reason={reasons[row.key as keyof typeof reasons]}
                  source={
                    setup.sources[row.key as keyof typeof setup.sources] ??
                    'agent'
                  }
                />
                {row.label}
              </span>
              <span className="truncate font-medium text-foreground">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {creditQuoteLabel ? (
          <span className="text-2xs text-muted-foreground">
            {creditQuoteLabel}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        <span className="gen-label-sm text-muted-foreground">
          {translate('presets')}
        </span>

        {isPresetsLoading ? (
          <span className="px-1 py-1.5 text-muted-foreground text-xs">
            {translate('loadingPresets')}
          </span>
        ) : null}

        {!isPresetsLoading && presets.length === 0 ? (
          <span className="px-1 py-1.5 text-muted-foreground text-xs">
            {translate('noPresets')}
          </span>
        ) : null}

        {presets.map((preset) => (
          <div
            className={cn(
              'group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-background-tertiary',
              setup.presetId === preset.id && 'bg-background-tertiary',
            )}
            key={preset.id}
          >
            <Button
              ariaLabel={`Apply preset ${preset.label}`}
              className="min-w-0 flex-1 justify-start truncate text-left text-foreground"
              isDisabled={isDisabled}
              label={preset.label}
              onClick={() => onApplyPreset(preset)}
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            />
            {onDeletePreset ? (
              <Button
                ariaLabel={`Delete preset ${preset.label}`}
                className="size-6 shrink-0 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                icon={<Trash2 className="size-3.5" />}
                isDisabled={isDisabled}
                onClick={() => onDeletePreset(preset.id)}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
