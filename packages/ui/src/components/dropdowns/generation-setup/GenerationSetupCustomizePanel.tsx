'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupCustomizePanelProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupBrandSection from '@ui/dropdowns/generation-setup/GenerationSetupBrandSection';
import GenerationSetupFieldIcon from '@ui/dropdowns/generation-setup/GenerationSetupFieldIcon';
import GenerationSetupModelSection from '@ui/dropdowns/generation-setup/GenerationSetupModelSection';
import GenerationSetupPresetsSection from '@ui/dropdowns/generation-setup/GenerationSetupPresetsSection';
import { Button } from '@ui/primitives/button';
import { Pin, Undo2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * One chip's panel (Model, Brand or Presets). The chip that opened it is the
 * only way in, so there is no back button: the header names the section.
 */
export default function GenerationSetupCustomizePanel({
  typeOptions,
  capabilities,
  creditsAvailable,
  favoriteModelKeys,
  initialSection,
  isPresetsLoading,
  onApplyPreset,
  onApplySystemPreset,
  onClearPreset,
  onDeletePreset,
  presets,
  systemPresets,
  isDisabled = false,
  models,
  onFavoriteToggle,
  onResetField,
  onSavePreset,
  onSetField,
  reasons,
  setup,
  showEnhancementSettings,
}: GenerationSetupCustomizePanelProps) {
  const translate = useTranslations('agent.generationSetup');
  const resolvedSection = initialSection;
  const pinnedPreset = setup.presetId
    ? (presets.find((preset) => preset.id === setup.presetId) ??
      systemPresets?.find((preset) => preset.id === setup.presetId))
    : undefined;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
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

        {resolvedSection === 'brand' ? (
          <GenerationSetupBrandSection
            capabilities={capabilities}
            onResetField={onResetField}
            onSetField={onSetField}
            reasons={reasons}
            setup={setup}
            showEnhancementSettings={showEnhancementSettings}
          />
        ) : null}
        {resolvedSection === 'presets' && setup.presetId && onClearPreset ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <Pin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">
                {translate('pinned', {
                  label: pinnedPreset?.label ?? translate('presets'),
                })}
              </span>
            </span>
            <Button
              ariaLabel={translate('unpinPreset')}
              className="size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              icon={<X className="size-3" />}
              isDisabled={isDisabled}
              onClick={onClearPreset}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
            />
          </div>
        ) : null}
        {resolvedSection === 'presets' ? (
          <GenerationSetupPresetsSection
            isDisabled={isDisabled}
            isPresetsLoading={isPresetsLoading}
            onApplyPreset={onApplyPreset}
            onApplySystemPreset={onApplySystemPreset}
            onDeletePreset={onDeletePreset}
            onSavePreset={onSavePreset}
            presets={presets}
            systemPresets={systemPresets}
            setup={setup}
          />
        ) : null}
      </div>
    </div>
  );
}
