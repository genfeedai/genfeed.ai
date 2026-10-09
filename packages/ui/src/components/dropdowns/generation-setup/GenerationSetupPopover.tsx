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
import { Switch } from '@ui/primitives/switch';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { Pin, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useState, useSyncExternalStore } from 'react';

const DESKTOP_SUBMENU_QUERY =
  '(hover: hover) and (pointer: fine) and (min-width: 848px)';
function getDesktopSubmenuQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return null;
  return window.matchMedia(DESKTOP_SUBMENU_QUERY);
}
function subscribeToDesktopSubmenus(onChange: () => void): () => void {
  const query = getDesktopSubmenuQuery();
  if (!query) return () => undefined;
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function getDesktopSubmenuSnapshot(): boolean {
  return getDesktopSubmenuQuery()?.matches ?? false;
}
function getServerSubmenuSnapshot(): boolean {
  return false;
}

const GenerationSetupPopover = memo(function GenerationSetupPopover({
  advancedMode,
  align = 'start',
  showEnhancementSettings = false,
  showPresets = true,
  buttonRef,
  capabilities,
  inputControls,
  referenceCount,
  className,
  creditsAvailable,
  favoriteModelKeys,
  isDisabled = false,
  isIconOnly = false,
  imageEditing,
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
  const hasDesktopSubmenus = useSyncExternalStore(
    subscribeToDesktopSubmenus,
    getDesktopSubmenuSnapshot,
    getServerSubmenuSnapshot,
  );
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

  function renderCustomizeSection(section: GenerationSetupCustomizeSectionId) {
    return (
      <GenerationSetupCustomizePanel
        isAutoPriorityOnly={advancedMode?.isEnabled === false}
        typeOptions={typeOptions}
        onTypeChange={onTypeChange}
        inputControls={inputControls}
        referenceCount={referenceCount}
        capabilities={capabilities}
        creditsAvailable={creditsAvailable}
        favoriteModelKeys={favoriteModelKeys}
        initialSection={section}
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
    );
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
          isIconOnly={isIconOnly}
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
        align={align}
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

            {(!customizeSection || hasDesktopSubmenus) && advancedMode ? (
              <div className="shrink-0 border-b border-border px-3 py-2">
                <div
                  aria-label={translate('advancedMode')}
                  className="gen-shell-segmented flex gap-0.5 rounded-md p-0.5"
                  role="group"
                >
                  {[false, true].map((isAdvanced) => (
                    <Button
                      key={String(isAdvanced)}
                      aria-pressed={advancedMode.isEnabled === isAdvanced}
                      className="h-8 flex-1 text-xs"
                      isDisabled={isDisabled}
                      onClick={() => advancedMode.onChange(isAdvanced)}
                      size={ButtonSize.SM}
                      textTransform="none"
                      variant={
                        advancedMode.isEnabled === isAdvanced
                          ? ButtonVariant.SECONDARY
                          : ButtonVariant.GHOST
                      }
                      withWrapper={false}
                    >
                      {translate(isAdvanced ? 'advancedMode' : 'auto')}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {(!customizeSection || hasDesktopSubmenus) && imageEditing ? (
              <div className="shrink-0 border-b border-border px-3 py-2">
                <Switch
                  aria-label={imageEditing.label}
                  isChecked={imageEditing.isEnabled}
                  isDisabled={isDisabled}
                  label={<span className="text-xs">{imageEditing.label}</span>}
                  onCheckedChange={imageEditing.onChange}
                />
              </div>
            ) : null}

            {!customizeSection || hasDesktopSubmenus ? (
              <GenerationSetupFrontDoor
                activeSection={customizeSection}
                onCloseSection={() => setCustomizeSection(undefined)}
                renderSection={
                  hasDesktopSubmenus ? renderCustomizeSection : undefined
                }
                isAutoPriorityOnly={advancedMode?.isEnabled === false}
                showPresets={showPresets}
                showEnhancementSettings={showEnhancementSettings}
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

            {customizeSection && !hasDesktopSubmenus
              ? renderCustomizeSection(customizeSection)
              : null}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});

export default GenerationSetupPopover;
