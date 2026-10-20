'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupChipId,
  GenerationSetupSectionChipsProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { usePromptBarRowFit } from '@hooks/prompt-bar/use-prompt-bar-row-fit/use-prompt-bar-row-fit';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import GenerationSetupAspectRatioIcon from '@ui/dropdowns/generation-setup/GenerationSetupAspectRatioIcon';
import GenerationSetupCustomizePanel from '@ui/dropdowns/generation-setup/GenerationSetupCustomizePanel';
import GenerationSetupLookMenu from '@ui/dropdowns/generation-setup/GenerationSetupLookMenu';
import GenerationSetupOutputMenu from '@ui/dropdowns/generation-setup/GenerationSetupOutputMenu';
import { summarizeGenerationSetup } from '@ui/dropdowns/generation-setup/generation-setup.summary';
import ModelAvatar from '@ui/models/ModelAvatar';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { Bookmark, Copy, Cpu, Megaphone, Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';

interface SectionChip {
  icon: ReactNode;
  id: GenerationSetupChipId;
  label: string;
  value: string;
}

/**
 * Advanced mode's setup, one level deep: Model, Output, Look, Brand and
 * Presets sit in the toolbar as chips, each opening only its own section.
 * Model comes first so it always follows the type button. Output and Look
 * are nested menus that open their lists to the side; only one chip is open
 * at a time. The row stays on one line; when it runs out of room the chips
 * keep their icons and drop their labels, which stay in the tooltip.
 */
export default function GenerationSetupSectionChips(
  props: GenerationSetupSectionChipsProps,
) {
  const {
    afterModel,
    capabilities,
    inputControls,
    isDisabled = false,
    lookOptions,
    models,
    outputControls,
    referenceCount,
    setup,
    showEnhancementSettings = false,
    showPresets = true,
    trailing,
  } = props;
  const translate = useTranslations('agent.generationSetup');
  const rowRef = useRef<HTMLDivElement>(null);
  const [openSection, setOpenSection] = useState<GenerationSetupChipId>();
  const scopedLookOptions =
    inputControls?.mediaKind === 'video'
      ? { ...lookOptions, resolution: [] }
      : lookOptions;
  const summary = summarizeGenerationSetup({
    autoLabel: translate('auto'),
    capabilities,
    formatDuration: (seconds) => translate('durationSeconds', { seconds }),
    inputControls,
    lookOptions,
    models,
    setup,
  });
  const pinnedPreset = setup.presetId
    ? (props.presets.find((preset) => preset.id === setup.presetId) ??
      props.systemPresets?.find((preset) => preset.id === setup.presetId))
    : undefined;

  const chips: SectionChip[] = [];
  if (capabilities.hasModelSelection)
    chips.push({
      icon: summary.selectedModel ? (
        <ModelAvatar model={summary.selectedModel} />
      ) : (
        <Cpu aria-hidden="true" className={SHELL_ICON_CLASS} />
      ),
      id: 'model',
      label: translate('model'),
      value: summary.modelLabel,
    });
  if (summary.hasOutputFields && summary.outputLabel)
    chips.push({
      icon: capabilities.hasAspectRatio ? (
        <GenerationSetupAspectRatioIcon ratio={setup.values.aspectRatio} />
      ) : (
        <Copy aria-hidden="true" className={SHELL_ICON_CLASS} />
      ),
      id: 'output',
      label: translate('output'),
      value: summary.outputLabel,
    });
  if (summary.hasLookFields)
    chips.push({
      icon: <Palette aria-hidden="true" className={SHELL_ICON_CLASS} />,
      id: 'look',
      label: translate('look'),
      value: translate('look'),
    });
  if (capabilities.hasBrandEnrichment || showEnhancementSettings)
    chips.push({
      icon: <Megaphone aria-hidden="true" className={SHELL_ICON_CLASS} />,
      id: 'brand',
      label: translate('brand'),
      value: translate('brand'),
    });
  if (showPresets)
    chips.push({
      icon: <Bookmark aria-hidden="true" className={SHELL_ICON_CLASS} />,
      id: 'presets',
      label: translate('presets'),
      value: pinnedPreset?.label ?? translate('presets'),
    });

  const { isCompact } = usePromptBarRowFit({
    contentKey: chips.map((chip) => `${chip.id}:${chip.value}`).join('|'),
    rowRef,
  });

  if (chips.length === 0 && !afterModel && !trailing) return null;

  function setOpen(id: GenerationSetupChipId, isOpen: boolean): void {
    setOpenSection(isOpen && !isDisabled ? id : undefined);
  }

  function renderTrigger(chip: SectionChip): ReactNode {
    return (
      <Button
        ariaLabel={translate('configureSection', { section: chip.label })}
        className={cn(
          SHELL_CONTROL_HEIGHT_CLASS,
          'min-w-0 shrink-0 flex-nowrap gap-1.5 px-2 text-xs font-medium text-foreground',
          isCompact && 'size-8 justify-center p-0',
        )}
        isDisabled={isDisabled}
        size={ButtonSize.SM}
        textTransform="none"
        title={`${chip.label}: ${chip.value}`}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        {chip.icon}
        {isCompact ? null : (
          <span className="max-w-36 truncate">{chip.value}</span>
        )}
      </Button>
    );
  }

  function renderChip(chip: SectionChip): ReactNode {
    if (chip.id === 'output' || chip.id === 'look') {
      return (
        <DropdownMenu
          key={chip.id}
          modal={false}
          onOpenChange={(isOpen) => setOpen(chip.id, isOpen)}
          open={openSection === chip.id}
        >
          <DropdownMenuTrigger asChild>
            {renderTrigger(chip)}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label={chip.label}
            className="w-64 py-1"
            collisionPadding={16}
            side="top"
            sideOffset={8}
          >
            {chip.id === 'output' ? (
              <GenerationSetupOutputMenu
                capabilities={capabilities}
                controls={outputControls}
                inputControls={inputControls}
                models={models}
                onResetField={props.onResetField}
                onSetField={props.onSetField}
                referenceCount={referenceCount}
                setup={setup}
              />
            ) : (
              <GenerationSetupLookMenu
                lookOptions={scopedLookOptions}
                onResetField={props.onResetField}
                onSetField={props.onSetField}
                setup={setup}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    const section = chip.id;
    return (
      <Popover
        key={chip.id}
        onOpenChange={(isOpen) => setOpen(chip.id, isOpen)}
        open={openSection === chip.id}
      >
        <PopoverTrigger asChild>{renderTrigger(chip)}</PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={chip.label}
          avoidCollisions
          className={cn(
            overlayMenuSurfaceClassName,
            'flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0 sm:w-[360px]',
            'max-h-[min(560px,var(--radix-popover-content-available-height,70vh))]',
          )}
          collisionPadding={16}
          side="top"
          sideOffset={8}
        >
          <TooltipProvider delayDuration={200}>
            {openSection === chip.id ? (
              <GenerationSetupCustomizePanel
                {...props}
                initialSection={section as 'brand' | 'model' | 'presets'}
              />
            ) : null}
          </TooltipProvider>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <div
        className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-compact={isCompact ? 'true' : undefined}
        data-testid="generation-setup-section-chips"
        ref={rowRef}
      >
        {chips.map((chip) => (
          <span className="contents" key={chip.id}>
            {renderChip(chip)}
            {chip.id === 'model' ? afterModel : null}
          </span>
        ))}
        {chips.every((chip) => chip.id !== 'model') ? afterModel : null}
      </div>
      {trailing}
    </>
  );
}
