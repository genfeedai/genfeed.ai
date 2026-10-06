'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  GenerationSetupCustomizePanelProps,
  GenerationSetupCustomizeSectionId,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupBrandSection from '@ui/dropdowns/generation-setup/GenerationSetupBrandSection';
import GenerationSetupFieldIcon from '@ui/dropdowns/generation-setup/GenerationSetupFieldIcon';
import GenerationSetupLookSection from '@ui/dropdowns/generation-setup/GenerationSetupLookSection';
import GenerationSetupModelSection from '@ui/dropdowns/generation-setup/GenerationSetupModelSection';
import GenerationSetupOutputSection from '@ui/dropdowns/generation-setup/GenerationSetupOutputSection';
import GenerationSetupPresetsSection from '@ui/dropdowns/generation-setup/GenerationSetupPresetsSection';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Undo2 } from 'lucide-react';

const SECTION_LABELS: Record<GenerationSetupCustomizeSectionId, string> = {
  brand: 'Brand',
  look: 'Look',
  model: 'Model',
  output: 'Output',
  presets: 'Presets',
};

export default function GenerationSetupCustomizePanel({
  capabilities,
  inputControls,
  referenceCount,
  creditsAvailable,
  favoriteModelKeys,
  initialSection,
  isPresetsLoading,
  onApplyPreset,
  onDeletePreset,
  presets,
  isDisabled = false,
  lookOptions,
  models,
  onBack,
  onFavoriteToggle,
  onResetField,
  onSavePreset,
  onSetField,
  reasons,
  setup,
}: GenerationSetupCustomizePanelProps) {
  const scopedLookOptions =
    inputControls?.mediaKind === 'video'
      ? { ...lookOptions, resolution: [] }
      : lookOptions;
  const resolvedSection = initialSection;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Button
          ariaLabel="Back to setup"
          className="size-7 shrink-0 p-0"
          icon={<ArrowLeft className="size-3.5" />}
          onClick={onBack}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
        />

        {resolvedSection === 'model' ? (
          <GenerationSetupFieldIcon
            fieldKey="modelKey"
            reason={reasons.modelKey ?? reasons.prioritize}
            source={setup.sources.modelKey ?? 'agent'}
          />
        ) : null}
        <span className="text-xs font-medium">
          {SECTION_LABELS[resolvedSection]}
        </span>
        {resolvedSection === 'model' &&
        setup.sources.modelKey &&
        setup.sources.modelKey !== 'agent' ? (
          <Button
            ariaLabel="Reset model to agent"
            className="size-6 p-0 text-muted-foreground"
            icon={<Undo2 className="size-3" />}
            onClick={() => onResetField('modelKey')}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
          />
        ) : null}
        <span className="ml-auto text-xs capitalize text-muted-foreground">
          {setup.values.type}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {resolvedSection === 'model' ? (
          <GenerationSetupModelSection
            capabilities={capabilities}
            creditsAvailable={creditsAvailable}
            favoriteModelKeys={favoriteModelKeys}
            isDisabled={isDisabled}
            models={models}
            onFavoriteToggle={onFavoriteToggle}
            onSetField={onSetField}
            setup={setup}
          />
        ) : null}

        {resolvedSection === 'look' ? (
          <GenerationSetupLookSection
            lookOptions={scopedLookOptions}
            onResetField={onResetField}
            onSetField={onSetField}
            reasons={reasons}
            setup={setup}
          />
        ) : null}

        {resolvedSection === 'output' ? (
          <GenerationSetupOutputSection
            inputControls={inputControls}
            referenceCount={referenceCount}
            capabilities={capabilities}
            onResetField={onResetField}
            onSetField={onSetField}
            reasons={reasons}
            setup={setup}
          />
        ) : null}

        {resolvedSection === 'brand' ? (
          <GenerationSetupBrandSection
            onResetField={onResetField}
            onSetField={onSetField}
            reasons={reasons}
            setup={setup}
          />
        ) : null}
        {resolvedSection === 'presets' ? (
          <GenerationSetupPresetsSection
            isDisabled={isDisabled}
            isPresetsLoading={isPresetsLoading}
            onApplyPreset={onApplyPreset}
            onDeletePreset={onDeletePreset}
            onSavePreset={onSavePreset}
            presets={presets}
            setup={setup}
          />
        ) : null}
      </div>
    </div>
  );
}
