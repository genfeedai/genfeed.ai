'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupFieldKey } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupFrontDoorProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupFieldIcon from '@ui/dropdowns/generation-setup/GenerationSetupFieldIcon';
import { isAutoGenerationModelKey } from '@ui/dropdowns/model-selector/model-selector.constants';
import { Button } from '@ui/primitives/button';
import { ChevronRight, Search, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Layer 1 of the popover: the agent's summary of what it picked and why, the
 * preset list (apply = pin), and the entry point into the search layer. Every
 * summary field routes directly to the nested section that owns it.
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

  const modelLabel = isAutoGenerationModelKey(setup.values.modelKey)
    ? translate('auto')
    : (models.find((model) => model.key === setup.values.modelKey)?.label ??
      setup.values.modelKey);

  const summaryRows: Array<{
    key: GenerationSetupFieldKey;
    label: string;
    section: GenerationSetupCustomizeSectionId;
    value: string;
  }> = [
    {
      key: 'type',
      label: translate('type'),
      section: 'model',
      value: typeLabel,
    },
    {
      key: 'modelKey',
      label: translate('model'),
      section: 'model',
      value: modelLabel,
    },
  ];

  if (capabilities.hasAspectRatio) {
    summaryRows.push({
      key: 'aspectRatio',
      label: translate('aspectRatio'),
      section: 'output',
      value: setup.values.aspectRatio,
    });
  }
  if (capabilities.hasDuration && setup.values.duration) {
    summaryRows.push({
      key: 'duration',
      label: translate('duration'),
      section: 'output',
      value: `${setup.values.duration}s`,
    });
  }
  if (capabilities.hasOutputs) {
    summaryRows.push({
      key: 'outputs',
      label: translate('outputs'),
      section: 'output',
      value: String(setup.values.outputs),
    });
  }
  summaryRows.push({
    key: 'brandingMode',
    label: translate('brandVoice'),
    section: 'brand',
    value:
      setup.values.brandingMode === 'brand'
        ? translate('on')
        : translate('off'),
  });
  summaryRows.push({
    key: 'isPromptEnhanceEnabled',
    label: translate('promptEnhance'),
    section: 'brand',
    value: setup.values.isPromptEnhanceEnabled
      ? translate('on')
      : translate('off'),
  });

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3">
      <Button
        ariaLabel={translate('searchSetupFields')}
        className="w-full justify-start gap-2 rounded-md border border-border bg-background-secondary px-2.5 text-xs text-muted-foreground hover:text-foreground"
        icon={<Search className="size-3.5 shrink-0" />}
        isDisabled={isDisabled}
        label={translate('searchFields')}
        onClick={onSearch}
        size={ButtonSize.SM}
        textTransform="none"
        variant={ButtonVariant.SECONDARY}
      />

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background-secondary p-2.5">
        <Button
          ariaLabel={translate('customizeSetup')}
          className="h-control-sm w-full justify-between gap-2 px-1 text-xs hover:bg-background-tertiary"
          isDisabled={isDisabled}
          onClick={() => onCustomize()}
          size={ButtonSize.SM}
          textTransform="none"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <Sparkles className="size-3.5 shrink-0" />
            {translate('agentPick')}
          </span>
          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
            {translate('customize')}
            <ChevronRight className="size-3" />
          </span>
        </Button>

        <div className="flex flex-col gap-1.5">
          {summaryRows.map((row) => (
            <Button
              ariaLabel={translate('editField', { field: row.label })}
              className="group h-auto w-full justify-between gap-3 rounded-sm px-1 py-1 text-xs hover:bg-background-tertiary"
              isDisabled={isDisabled}
              key={row.key}
              onClick={() => onCustomize(row.section)}
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <GenerationSetupFieldIcon
                  fieldKey={row.key}
                  reason={reasons[row.key as keyof typeof reasons]}
                  source={
                    setup.sources[row.key as keyof typeof setup.sources] ??
                    'agent'
                  }
                />
                {row.label}
              </span>
              <span className="flex min-w-0 items-center gap-1 font-medium text-foreground">
                <span className="truncate">{row.value}</span>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground group-focus-visible:text-muted-foreground" />
              </span>
            </Button>
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
              ariaLabel={translate('applyPreset', { label: preset.label })}
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
                ariaLabel={translate('deletePreset', { label: preset.label })}
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
