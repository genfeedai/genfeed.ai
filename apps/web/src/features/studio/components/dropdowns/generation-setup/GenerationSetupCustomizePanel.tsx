'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import { Button } from '@ui/primitives/button';
import { Pin, RotateCcw, Undo2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import GenerationSetupBrandSection from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupBrandSection';
import GenerationSetupFieldIcon from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupFieldIcon';
import GenerationSetupModelSection from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupModelSection';
import GenerationSetupPresetsSection from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupPresetsSection';
import type { GenerationSetupCustomizePanelProps } from '@/features/studio/props/generation-setup.props';

/**
 * One chip's panel (Model, Brand or Presets). The chip that opened it is the
 * only way in, so there is no back button. Only the Model panel has a header (its reset and
 * the type); Brand and Presets start with their content.
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
  onResetAll,
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
  // The type is named once, here, so model rows do not repeat it on each avatar.
  const TypeIcon = getModelCategoryIcon(
    setup.values.type === 'image-edit' ? 'image' : setup.values.type,
  );
  const pinnedPreset = setup.presetId
    ? (presets.find((preset) => preset.id === setup.presetId) ??
      systemPresets?.find((preset) => preset.id === setup.presetId))
    : undefined;

  // Auto sets both fields at once, so one control resets whichever are set.
  const isModelKeyOverridden = Boolean(
    setup.sources.modelKey && setup.sources.modelKey !== 'agent',
  );
  const isPriorityOverridden = Boolean(
    setup.sources.prioritize && setup.sources.prioritize !== 'agent',
  );
  const isModelOverridden = isModelKeyOverridden || isPriorityOverridden;

  return (
    <div className="flex min-h-0 flex-col">
      {resolvedSection === 'model' ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
          <GenerationSetupFieldIcon
            fieldKey="modelKey"
            reason={reasons.modelKey ?? reasons.prioritize}
            source={setup.sources.modelKey ?? 'agent'}
          />
          <span className="text-xs font-medium">
            {translate(resolvedSection)}
          </span>
          {isModelOverridden ? (
            <Button
              ariaLabel={translate('resetModel')}
              className="size-6 p-0 text-muted-foreground"
              icon={<Undo2 className="size-3" />}
              onClick={() => {
                if (isModelKeyOverridden) onResetField('modelKey');
                if (isPriorityOverridden) onResetField('prioritize');
              }}
              size={ButtonSize.ICON}
              tooltip={translate('resetModel')}
              variant={ButtonVariant.GHOST}
            />
          ) : null}
          <span className="ml-auto flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
            <TypeIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {typeOptions.find((option) => option.value === setup.values.type)
              ?.label ?? setup.values.type}
          </span>
        </div>
      ) : null}

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
        {resolvedSection === 'presets' && onResetAll ? (
          <Button
            className="mb-2 w-full justify-start text-xs"
            icon={<RotateCcw aria-hidden="true" className="size-3.5" />}
            isDisabled={isDisabled}
            onClick={onResetAll}
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('resetToDefaults')}
          </Button>
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
