'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupCustomizePanelProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationHarnessSettingsSection from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsSection';
import GenerationSetupBrandSection from '@ui/dropdowns/generation-setup/GenerationSetupBrandSection';
import GenerationSetupFieldIcon from '@ui/dropdowns/generation-setup/GenerationSetupFieldIcon';
import GenerationSetupLookSection from '@ui/dropdowns/generation-setup/GenerationSetupLookSection';
import GenerationSetupModelSection from '@ui/dropdowns/generation-setup/GenerationSetupModelSection';
import GenerationSetupOutputSection from '@ui/dropdowns/generation-setup/GenerationSetupOutputSection';
import GenerationSetupPresetsSection from '@ui/dropdowns/generation-setup/GenerationSetupPresetsSection';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Check, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function GenerationSetupCustomizePanel({
  typeOptions,
  onTypeChange,
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
  const translate = useTranslations('agent.generationSetup');
  const scopedLookOptions =
    inputControls?.mediaKind === 'video'
      ? { ...lookOptions, resolution: [] }
      : lookOptions;
  const resolvedSection = initialSection;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Button
          ariaLabel={translate('backToSetup')}
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
          {translate(resolvedSection)}
        </span>
        {resolvedSection === 'model' &&
        setup.sources.modelKey &&
        setup.sources.modelKey !== 'agent' ? (
          <Button
            ariaLabel={translate('resetModel')}
            className="size-6 p-0 text-muted-foreground"
            icon={<Undo2 className="size-3" />}
            onClick={() => onResetField('modelKey')}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
          />
        ) : null}
        {resolvedSection === 'model' &&
        setup.sources.prioritize &&
        setup.sources.prioritize !== 'agent' ? (
          <Button
            ariaLabel={translate('resetPriority')}
            className="size-6 p-0 text-muted-foreground"
            icon={<Undo2 className="size-3" />}
            onClick={() => onResetField('prioritize')}
            size={ButtonSize.ICON}
            tooltip={translate('resetPriorityTooltip')}
            variant={ButtonVariant.GHOST}
          />
        ) : null}
        <span className="ml-auto text-xs capitalize text-muted-foreground">
          {typeOptions.find((option) => option.value === setup.values.type)
            ?.label ?? setup.values.type}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {resolvedSection === 'type' ? (
          <div className="flex flex-col gap-1">
            {typeOptions.map((option) => (
              <Button
                key={option.value}
                aria-pressed={setup.values.type === option.value}
                className="h-9 w-full justify-between px-2 text-xs"
                isDisabled={isDisabled}
                variant={ButtonVariant.GHOST}
                textTransform="none"
                withWrapper={false}
                onClick={() => {
                  if (option.value !== setup.values.type) {
                    onSetField('type', option.value);
                    onTypeChange?.(option.value);
                  }
                  onBack();
                }}
              >
                {option.label}
                {setup.values.type === option.value ? (
                  <Check className="size-3.5" />
                ) : null}
              </Button>
            ))}
          </div>
        ) : null}
        {resolvedSection === 'enhancement' ? (
          <GenerationHarnessSettingsSection />
        ) : null}

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
