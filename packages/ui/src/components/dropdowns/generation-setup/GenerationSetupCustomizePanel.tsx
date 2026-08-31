'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupCustomizePanelProps,
  GenerationSetupCustomizeSectionId,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupBrandSection from '@ui/dropdowns/generation-setup/GenerationSetupBrandSection';
import GenerationSetupLookSection from '@ui/dropdowns/generation-setup/GenerationSetupLookSection';
import GenerationSetupModelSection from '@ui/dropdowns/generation-setup/GenerationSetupModelSection';
import GenerationSetupOutputSection from '@ui/dropdowns/generation-setup/GenerationSetupOutputSection';
import GenerationSetupSavePresetRow from '@ui/dropdowns/generation-setup/GenerationSetupSavePresetRow';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

const SECTION_LABELS: Record<GenerationSetupCustomizeSectionId, string> = {
  brand: 'Brand',
  look: 'Look',
  model: 'Model',
  output: 'Output',
};

/**
 * Layer 3 of the popover: a tab rail driven by capability flags, a Type
 * switcher (when more than one type is offered), per-field provenance inside
 * each section, "Reset all", and the save-as-preset footer.
 */
export default function GenerationSetupCustomizePanel({
  capabilities,
  creditQuoteLabel,
  creditsAvailable,
  favoriteModelKeys,
  initialSection,
  isDisabled = false,
  lookOptions,
  models,
  onBack,
  onFavoriteToggle,
  onResetAll,
  onResetField,
  onSavePreset,
  onSetField,
  onTypeChange,
  reasons,
  setup,
  typeOptions,
}: GenerationSetupCustomizePanelProps) {
  const hasLookFields = Object.values(lookOptions).some(
    (options) => (options?.length ?? 0) > 0,
  );

  const availableSections = useMemo<GenerationSetupCustomizeSectionId[]>(() => {
    const sections: GenerationSetupCustomizeSectionId[] = [];
    if (capabilities.hasModelSelection) {
      sections.push('model');
    }
    if (hasLookFields) {
      sections.push('look');
    }
    if (
      capabilities.hasAspectRatio ||
      capabilities.hasDuration ||
      capabilities.hasOutputs
    ) {
      sections.push('output');
    }
    sections.push('brand');
    return sections;
  }, [capabilities, hasLookFields]);

  const [activeSection, setActiveSection] =
    useState<GenerationSetupCustomizeSectionId>(
      initialSection ?? availableSections[0] ?? 'brand',
    );

  const resolvedSection = availableSections.includes(activeSection)
    ? activeSection
    : (availableSections[0] ?? 'brand');

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

        {typeOptions.length > 1 ? (
          <Select
            onValueChange={(value) => {
              const option = typeOptions.find((entry) => entry.value === value);
              if (!option) {
                return;
              }
              onSetField('type', option.value);
              onTypeChange?.(option.value);
            }}
            value={setup.values.type}
          >
            <SelectTrigger
              aria-label="Generation type"
              className={cn('w-28 shrink-0', SHELL_CONTROL_HEIGHT_CLASS)}
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
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
          {availableSections.map((section) => (
            <Button
              ariaLabel={`${SECTION_LABELS[section]} tab`}
              className={cn(
                'h-control-sm px-2 text-2xs text-muted-foreground',
                resolvedSection === section &&
                  'bg-background-tertiary text-foreground',
              )}
              isDisabled={isDisabled}
              key={section}
              label={SECTION_LABELS[section]}
              onClick={() => setActiveSection(section)}
              size={ButtonSize.XS}
              textTransform="none"
              variant={ButtonVariant.GHOST}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {resolvedSection === 'model' ? (
          <GenerationSetupModelSection
            capabilities={capabilities}
            creditQuoteLabel={creditQuoteLabel}
            creditsAvailable={creditsAvailable}
            favoriteModelKeys={favoriteModelKeys}
            isDisabled={isDisabled}
            models={models}
            onFavoriteToggle={onFavoriteToggle}
            onResetField={onResetField}
            onSetField={onSetField}
            reasons={reasons}
            setup={setup}
          />
        ) : null}

        {resolvedSection === 'look' ? (
          <GenerationSetupLookSection
            lookOptions={lookOptions}
            onResetField={onResetField}
            onSetField={onSetField}
            reasons={reasons}
            setup={setup}
          />
        ) : null}

        {resolvedSection === 'output' ? (
          <GenerationSetupOutputSection
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
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-2.5">
        <Button
          ariaLabel="Reset all fields to agent"
          className="self-end text-muted-foreground"
          icon={<RotateCcw className="size-3.5" />}
          isDisabled={isDisabled}
          label="Reset all"
          onClick={onResetAll}
          size={ButtonSize.XS}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        />
        <GenerationSetupSavePresetRow
          isDisabled={isDisabled}
          onSavePreset={onSavePreset}
        />
      </div>
    </div>
  );
}
