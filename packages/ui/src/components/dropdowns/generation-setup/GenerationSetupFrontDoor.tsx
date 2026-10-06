'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupFrontDoorProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { isAutoGenerationModelKey } from '@ui/dropdowns/model-selector/model-selector.constants';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ChevronRight, RotateCcw } from 'lucide-react';

export default function GenerationSetupFrontDoor({
  capabilities,
  inputControls,
  isDisabled = false,
  lookOptions,
  models,
  onCustomize,
  onResetAll,
  onSetField,
  onTypeChange,
  presets,
  setup,
  typeOptions,
}: GenerationSetupFrontDoorProps) {
  const modelLabel = isAutoGenerationModelKey(setup.values.modelKey)
    ? 'Auto'
    : (models.find((model) => model.key === setup.values.modelKey)?.label ??
      setup.values.modelKey);
  const duration =
    setup.values.type === 'music'
      ? normalizeMusicSettings(setup.values.modelKey, setup.values).duration
      : setup.values.duration;
  const outputLabel = [
    capabilities.hasAspectRatio && setup.values.aspectRatio,
    capabilities.hasDuration && duration && `${duration}s`,
    capabilities.hasOutputs &&
      `${setup.values.outputs} output${setup.values.outputs === 1 ? '' : 's'}`,
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
  }[] = [];
  if (capabilities.hasModelSelection)
    sections.push({ id: 'model', label: 'Model', value: modelLabel });
  if (
    capabilities.hasAspectRatio ||
    capabilities.hasDuration ||
    capabilities.hasOutputs ||
    capabilities.hasStyle ||
    capabilities.hasInstrumentalToggle ||
    capabilities.hasLyrics
  )
    sections.push({ id: 'output', label: 'Output', value: outputLabel });
  if (hasLookFields) sections.push({ id: 'look', label: 'Look' });
  if (capabilities.hasBrandEnrichment)
    sections.push({
      id: 'brand',
      label: 'Brand',
      value: setup.values.brandingMode === 'brand' ? 'On' : 'Off',
    });
  sections.push({
    id: 'presets',
    label: 'Presets',
    value: presets.length ? String(presets.length) : undefined,
  });
  return (
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <Select
          disabled={isDisabled || typeOptions.length < 2}
          value={setup.values.type}
          onValueChange={(value) => {
            const option = typeOptions.find((entry) => entry.value === value);
            if (!option) return;
            onSetField('type', option.value);
            onTypeChange?.(option.value);
          }}
        >
          <SelectTrigger
            aria-label="Generation type"
            className={SHELL_CONTROL_HEIGHT_CLASS}
          >
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 overflow-y-auto p-1.5">
        {sections.map((section) => (
          <Button
            key={section.id}
            ariaLabel={`Configure ${section.label}`}
            className="h-9 w-full justify-between gap-3 rounded-md px-2 text-xs"
            isDisabled={isDisabled}
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
          ariaLabel="Reset all fields to agent"
          className="text-muted-foreground"
          icon={<RotateCcw className="size-3.5" />}
          isDisabled={isDisabled}
          label="Reset all"
          onClick={onResetAll}
          size={ButtonSize.XS}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}
