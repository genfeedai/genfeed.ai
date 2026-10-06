'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupPopoverProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupCustomizePanel from '@ui/dropdowns/generation-setup/GenerationSetupCustomizePanel';
import GenerationSetupFrontDoor from '@ui/dropdowns/generation-setup/GenerationSetupFrontDoor';
import GenerationSetupTrigger from '@ui/dropdowns/generation-setup/GenerationSetupTrigger';
import { Button } from '@ui/primitives/button';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { Pin, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useState } from 'react';

const GenerationSetupPopover = memo(function GenerationSetupPopover({
  buttonRef,
  capabilities,
  inputControls,
  referenceCount,
  className,
  creditsAvailable,
  favoriteModelKeys,
  isDisabled = false,
  isPresetsLoading,
  isTypeCommitted,
  lookOptions,
  models,
  onApplyPreset,
  onClearPreset,
  onDeletePreset,
  onFavoriteToggle,
  onResetAll,
  onResetField,
  onSavePreset,
  onSetField,
  onTypeChange,
  presets,
  reasons,
  scopeKey: _scopeKey,
  setup,
  typeOptions,
  triggerLabel,
}: GenerationSetupPopoverProps) {
  const translate = useTranslations('agent.generationSetup');
  const [isOpen, setIsOpen] = useState(false);
  const [customizeSection, setCustomizeSection] =
    useState<GenerationSetupCustomizeSectionId>();

  function handleOpenChange(open: boolean): void {
    if (isDisabled) {
      return;
    }
    setIsOpen(open);
    if (!open) {
      setCustomizeSection(undefined);
    }
  }

  function handleCustomize(section: GenerationSetupCustomizeSectionId): void {
    setCustomizeSection(section);
  }

  function handleApplyPreset(preset: IStudioLook): void {
    onApplyPreset(preset);
    setCustomizeSection(undefined);
  }

  const pinnedPreset = setup.presetId
    ? presets.find((preset) => preset.id === setup.presetId)
    : undefined;

  return (
    <Popover onOpenChange={handleOpenChange} open={isDisabled ? false : isOpen}>
      <PopoverTrigger asChild>
        <GenerationSetupTrigger
          className={className}
          hasAspectRatio={capabilities.hasAspectRatio}
          isDisabled={isDisabled}
          isOpen={isOpen}
          isTypeCommitted={isTypeCommitted}
          models={models}
          ref={buttonRef}
          setup={setup}
          typeOptions={typeOptions}
          triggerLabel={triggerLabel}
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        avoidCollisions
        className={cn(
          overlayMenuSurfaceClassName,
          'w-[calc(100vw-2rem)] overflow-hidden rounded-lg p-0',
          'sm:w-[400px]',
          'max-h-[min(560px,var(--radix-popover-content-available-height,70vh))]',
        )}
        collisionPadding={16}
        side="top"
        sideOffset={8}
      >
        <TooltipProvider delayDuration={200}>
          <div className="flex max-h-[inherit] min-h-0 w-full flex-col bg-secondary">
            {setup.presetId ? (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background-secondary px-3 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <Pin className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {translate('pinned', {
                      label: pinnedPreset?.label ?? 'Preset',
                    })}
                  </span>
                </span>
                <Button
                  ariaLabel="Unpin preset"
                  className="size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  icon={<X className="size-3" />}
                  isDisabled={isDisabled}
                  onClick={onClearPreset}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                />
              </div>
            ) : null}

            {!customizeSection ? (
              <GenerationSetupFrontDoor
                capabilities={capabilities}
                inputControls={inputControls}
                isDisabled={isDisabled}
                lookOptions={lookOptions}
                models={models}
                onCustomize={handleCustomize}
                onResetAll={onResetAll}
                onSetField={onSetField}
                onTypeChange={onTypeChange}
                presets={presets}
                setup={setup}
                typeOptions={typeOptions}
              />
            ) : null}

            {customizeSection ? (
              <GenerationSetupCustomizePanel
                inputControls={inputControls}
                referenceCount={referenceCount}
                capabilities={capabilities}
                creditsAvailable={creditsAvailable}
                favoriteModelKeys={favoriteModelKeys}
                initialSection={customizeSection}
                isDisabled={isDisabled}
                isPresetsLoading={isPresetsLoading}
                onApplyPreset={handleApplyPreset}
                onDeletePreset={onDeletePreset}
                presets={presets}
                lookOptions={lookOptions}
                models={models}
                onBack={() => setCustomizeSection(undefined)}
                onFavoriteToggle={onFavoriteToggle}
                onResetField={onResetField}
                onSavePreset={onSavePreset}
                onSetField={onSetField}
                reasons={reasons}
                setup={setup}
              />
            ) : null}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});

export default GenerationSetupPopover;
