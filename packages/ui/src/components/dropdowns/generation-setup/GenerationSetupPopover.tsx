'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IStudioLook } from '@genfeedai/interfaces';
import type { GenerationSetupPopoverProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupCustomizePanel from '@ui/dropdowns/generation-setup/GenerationSetupCustomizePanel';
import GenerationSetupFrontDoor from '@ui/dropdowns/generation-setup/GenerationSetupFrontDoor';
import GenerationSetupSearch from '@ui/dropdowns/generation-setup/GenerationSetupSearch';
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

type GenerationSetupView = 'customize' | 'front-door' | 'search';

/**
 * Three layers in one popover: front door (agent-pick summary + presets +
 * search entry), search (flat cmdk index across every field), and customize
 * (capability-driven tab rail). One `view` state switches which layer
 * renders inside a single `PopoverContent`, mirroring ModelSelectorPopover's
 * data-agnostic, props-driven shape.
 */
const GenerationSetupPopover = memo(function GenerationSetupPopover({
  buttonRef,
  capabilities,
  className,
  creditQuoteLabel,
  creditsAvailable,
  favoriteModelKeys,
  isDisabled = false,
  isPresetsLoading,
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
}: GenerationSetupPopoverProps) {
  const translate = useTranslations('agent.generationSetup');
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<GenerationSetupView>('front-door');

  function handleOpenChange(open: boolean): void {
    if (isDisabled) {
      return;
    }
    setIsOpen(open);
    if (!open) {
      setView('front-door');
    }
  }

  function handleApplyPreset(preset: IStudioLook): void {
    onApplyPreset(preset);
    setView('front-door');
  }

  const pinnedPreset = setup.presetId
    ? presets.find((preset) => preset.id === setup.presetId)
    : undefined;

  return (
    <Popover onOpenChange={handleOpenChange} open={isDisabled ? false : isOpen}>
      <PopoverTrigger asChild>
        <GenerationSetupTrigger
          className={className}
          isDisabled={isDisabled}
          isOpen={isOpen}
          models={models}
          ref={buttonRef}
          setup={setup}
          typeOptions={typeOptions}
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

            {view === 'front-door' ? (
              <GenerationSetupFrontDoor
                capabilities={capabilities}
                creditQuoteLabel={creditQuoteLabel}
                isDisabled={isDisabled}
                isPresetsLoading={isPresetsLoading}
                models={models}
                onApplyPreset={handleApplyPreset}
                onCustomize={() => setView('customize')}
                onDeletePreset={onDeletePreset}
                onSearch={() => setView('search')}
                presets={presets}
                reasons={reasons}
                setup={setup}
                typeOptions={typeOptions}
              />
            ) : null}

            {view === 'search' ? (
              <GenerationSetupSearch
                capabilities={capabilities}
                lookOptions={lookOptions}
                models={models}
                onBack={() => setView('front-door')}
                onSetField={onSetField}
                setup={setup}
                typeOptions={typeOptions}
              />
            ) : null}

            {view === 'customize' ? (
              <GenerationSetupCustomizePanel
                capabilities={capabilities}
                creditQuoteLabel={creditQuoteLabel}
                creditsAvailable={creditsAvailable}
                favoriteModelKeys={favoriteModelKeys}
                isDisabled={isDisabled}
                lookOptions={lookOptions}
                models={models}
                onBack={() => setView('front-door')}
                onFavoriteToggle={onFavoriteToggle}
                onResetAll={onResetAll}
                onResetField={onResetField}
                onSavePreset={onSavePreset}
                onSetField={onSetField}
                onTypeChange={onTypeChange}
                reasons={reasons}
                setup={setup}
                typeOptions={typeOptions}
              />
            ) : null}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});

export default GenerationSetupPopover;
