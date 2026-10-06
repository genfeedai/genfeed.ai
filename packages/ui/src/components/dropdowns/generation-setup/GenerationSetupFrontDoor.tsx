'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupFrontDoorProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { isAutoGenerationModelKey } from '@ui/dropdowns/model-selector/model-selector.constants';
import { Button } from '@ui/primitives/button';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function GenerationSetupFrontDoor({
  showEnhancementSettings = false,
  capabilities,
  inputControls,
  isDisabled = false,
  lookOptions,
  models,
  onCustomize,
  onResetAll,
  presets,
  setup,
  typeOptions,
}: GenerationSetupFrontDoorProps) {
  const translate = useTranslations('agent.generationSetup');
  const modelLabel = isAutoGenerationModelKey(setup.values.modelKey)
    ? translate('auto')
    : (models.find((model) => model.key === setup.values.modelKey)?.label ??
      setup.values.modelKey);
  const duration =
    setup.values.type === 'music'
      ? normalizeMusicSettings(setup.values.modelKey, setup.values).duration
      : setup.values.duration;
  const outputLabel = [
    capabilities.hasAspectRatio && setup.values.aspectRatio,
    capabilities.hasDuration &&
      duration &&
      translate('durationSeconds', { seconds: duration }),
    capabilities.hasOutputs && `x${setup.values.outputs}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const hasLookFields = Object.entries(lookOptions).some(
    ([key, options]) =>
      (options?.length ?? 0) > 0 &&
      !(key === 'resolution' && inputControls?.mediaKind === 'video'),
  );
  const sections: {
    id: GenerationSetupCustomizeSectionId;
    label: string;
    value?: string;
    isDisabled?: boolean;
  }[] = [
    {
      id: 'type',
      label: translate('type'),
      value:
        typeOptions.find((option) => option.value === setup.values.type)
          ?.label ?? setup.values.type,
      isDisabled: typeOptions.length < 2,
    },
  ];
  if (capabilities.hasModelSelection)
    sections.push({
      id: 'model',
      label: translate('model'),
      value: modelLabel,
    });
  if (
    capabilities.hasAspectRatio ||
    capabilities.hasDuration ||
    capabilities.hasOutputs ||
    capabilities.hasStyle ||
    capabilities.hasInstrumentalToggle ||
    capabilities.hasLyrics
  )
    sections.push({
      id: 'output',
      label: translate('output'),
      value: outputLabel,
    });
  if (hasLookFields) sections.push({ id: 'look', label: translate('look') });
  if (capabilities.hasBrandEnrichment)
    sections.push({
      id: 'brand',
      label: translate('brand'),
      value:
        setup.values.brandingMode === 'brand'
          ? translate('on')
          : translate('off'),
    });
  sections.push({
    id: 'presets',
    label: translate('presets'),
    value: presets.length ? String(presets.length) : undefined,
  });
  if (showEnhancementSettings)
    sections.push({ id: 'enhancement', label: translate('enhancement') });
  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-y-auto p-1.5">
        {sections.map((section) => (
          <Button
            key={section.id}
            ariaLabel={translate('configureSection', {
              section: section.label,
            })}
            className="h-9 w-full justify-between gap-3 rounded-md px-2 text-xs"
            isDisabled={isDisabled || section.isDisabled}
            onClick={() => onCustomize(section.id)}
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <span>{section.label}</span>
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="truncate">{section.value}</span>
              <ChevronRight className="size-3.5 shrink-0" />
            </span>
          </Button>
        ))}
      </div>
      <div className="shrink-0 border-t border-border p-1.5">
        <Button
          ariaLabel={translate('resetAllAria')}
          className="text-muted-foreground"
          icon={<RotateCcw className="size-3.5" />}
          isDisabled={isDisabled}
          label={translate('resetAll')}
          onClick={onResetAll}
          size={ButtonSize.XS}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}
