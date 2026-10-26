'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupChipId,
  GenerationSetupSectionChipsProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  PROMPT_BAR_CHIP_FIT_CLASS,
  PROMPT_BAR_CHIP_LABEL_CLASS,
  PROMPT_BAR_SETUP_FOLD_CLASS,
  PROMPT_BAR_SETUP_MENU_CLASS,
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import GenerationSetupAspectRatioIcon from '@ui/dropdowns/generation-setup/GenerationSetupAspectRatioIcon';
import GenerationSetupCustomizePanel from '@ui/dropdowns/generation-setup/GenerationSetupCustomizePanel';
import GenerationSetupLookMenu from '@ui/dropdowns/generation-setup/GenerationSetupLookMenu';
import GenerationSetupOutputMenu from '@ui/dropdowns/generation-setup/GenerationSetupOutputMenu';
import { resolveGenerationSetupOutputFields } from '@ui/dropdowns/generation-setup/generation-setup.output-fields';
import { summarizeGenerationSetup } from '@ui/dropdowns/generation-setup/generation-setup.summary';
import { usePhoneViewport } from '@ui/dropdowns/generation-setup/usePhoneViewport';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { keepFocusOnSwitch } from '@ui/prompt-bars/base/keep-focus-on-switch';
import {
  Bookmark,
  Clock3,
  Copy,
  Cpu,
  Ellipsis,
  Megaphone,
  Palette,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

// Width of the More setup menu (`w-56`), the amount a phone submenu overlaps it.
const MORE_SETUP_MENU_WIDTH_PX = 224;

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
 * at a time. The chips are sized by the width of the tools group (see
 * `PromptBarToolbar`): all labelled, then all icon-only with the labels in the
 * tooltip, then folded into one More setup menu. Nothing scrolls.
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
  } = props;
  const translate = useTranslations('agent.generationSetup');
  const isPhoneViewport = usePhoneViewport();
  const [openSection, setOpenSection] = useState<GenerationSetupChipId>();
  const scopedLookOptions =
    inputControls?.mediaKind === 'video'
      ? { ...lookOptions, resolution: [] }
      : lookOptions;
  const summary = summarizeGenerationSetup({
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
      icon: <Cpu aria-hidden="true" className={SHELL_ICON_CLASS} />,
      id: 'model',
      label: translate('model'),
      value: summary.modelLabel,
    });
  const outputFields = resolveGenerationSetupOutputFields({
    capabilities,
    controls: outputControls,
    inputControls,
    models,
    referenceCount,
    setup,
  });
  if (outputFields.showAspectRatio)
    chips.push({
      icon: <GenerationSetupAspectRatioIcon ratio={setup.values.aspectRatio} />,
      id: 'aspectRatio',
      label: translate('aspectRatio'),
      value:
        setup.values.aspectRatio === 'auto'
          ? translate('auto')
          : setup.values.aspectRatio,
    });
  if (outputFields.showDuration)
    chips.push({
      icon: <Clock3 aria-hidden="true" className={SHELL_ICON_CLASS} />,
      id: 'duration',
      label: translate('duration'),
      value: summary.durationLabel || translate('duration'),
    });
  // Fields without a chip of their own stay summarised on the Output chip: a
  // Crun video model's controls own its ratio and length, so the menu holds
  // only those controls and the chip is where the values stay visible.
  const outputSummary = [
    capabilities.hasAspectRatio &&
      !outputFields.showAspectRatio &&
      setup.values.aspectRatio,
    capabilities.hasDuration &&
      !outputFields.showDuration &&
      summary.durationLabel,
    capabilities.hasOutputs && `x${setup.values.outputs}`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (outputSummary || outputFields.hasExtraFields)
    chips.push({
      icon: <Copy aria-hidden="true" className={SHELL_ICON_CLASS} />,
      id: 'output',
      label: translate('output'),
      value: outputSummary || translate('output'),
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

  if (chips.length === 0 && !afterModel) return null;

  // Switching chips closes the open one and opens the next in the same click.
  // The old chip's dismiss can land after the new chip opens, so a close only
  // clears the section when that chip is still the open one.
  function setOpen(id: GenerationSetupChipId, isOpen: boolean): void {
    setOpenSection((current) => {
      if (isOpen && !isDisabled) return id;
      return current === id ? undefined : current;
    });
  }

  function renderTrigger(chip: SectionChip): ReactNode {
    return (
      <Button
        ariaLabel={translate('configureSection', { section: chip.label })}
        className={cn(
          SHELL_CONTROL_HEIGHT_CLASS,
          'min-w-0 shrink-0 flex-nowrap gap-1.5 px-2 text-xs font-medium text-foreground',
          PROMPT_BAR_CHIP_FIT_CLASS,
          PROMPT_BAR_SETUP_FOLD_CLASS,
        )}
        isDisabled={isDisabled}
        size={ButtonSize.SM}
        textTransform="none"
        title={`${chip.label}: ${chip.value}`}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        {chip.icon}
        <span className={cn('max-w-36 truncate', PROMPT_BAR_CHIP_LABEL_CLASS)}>
          {chip.value}
        </span>
      </Button>
    );
  }

  // Chips whose menu is a plain list or form rather than a Customize panel.
  function isMenuChip(id: GenerationSetupChipId): boolean {
    return (
      id === 'aspectRatio' ||
      id === 'duration' ||
      id === 'look' ||
      id === 'output'
    );
  }

  function renderMenuBody(id: GenerationSetupChipId): ReactNode {
    if (id === 'look')
      return (
        <GenerationSetupLookMenu
          lookOptions={scopedLookOptions}
          onResetField={props.onResetField}
          onSetField={props.onSetField}
          setup={setup}
        />
      );
    return (
      <GenerationSetupOutputMenu
        capabilities={capabilities}
        controls={outputControls}
        inputControls={inputControls}
        models={models}
        onResetField={props.onResetField}
        onSetField={props.onSetField}
        referenceCount={referenceCount}
        section={id === 'aspectRatio' || id === 'duration' ? id : 'rest'}
        setup={setup}
      />
    );
  }

  function renderChip(chip: SectionChip): ReactNode {
    if (isMenuChip(chip.id)) {
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
            className={
              chip.id === 'aspectRatio' || chip.id === 'duration'
                ? 'w-52 max-w-[calc(100vw-2rem)] p-0'
                : 'w-[min(16rem,calc(100vw-2rem))] py-1'
            }
            collisionPadding={16}
            onCloseAutoFocus={keepFocusOnSwitch}
            side="top"
            sideOffset={8}
            // Keep the menu on screen when the chip sits near the right edge.
            sticky="always"
          >
            {renderMenuBody(chip.id)}
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
          onCloseAutoFocus={keepFocusOnSwitch}
          // Land on the search box when the panel has one, otherwise on the
          // panel itself: focusing its first button drew a focus outline on
          // a control nobody had pressed.
          onOpenAutoFocus={(event) => {
            const panel = event.currentTarget;
            if (!(panel instanceof HTMLElement)) return;
            event.preventDefault();
            (panel.querySelector('input') ?? panel).focus({
              preventScroll: true,
            });
          }}
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

  function renderMenuSection(chip: SectionChip): ReactNode {
    return (
      <DropdownMenuSub key={chip.id}>
        <DropdownMenuSubTrigger disabled={isDisabled}>
          <span className="mr-2 flex items-center">{chip.icon}</span>
          <span className="flex-1">{chip.label}</span>
          <span className="ml-2 max-w-24 truncate text-muted-foreground">
            {chip.value === chip.label ? null : chip.value}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className={
            chip.id === 'aspectRatio' || chip.id === 'duration'
              ? 'p-0'
              : chip.id === 'output' || chip.id === 'look'
                ? 'w-[min(16rem,calc(100vw-2rem))] py-1'
                : PROMPT_BAR_SETUP_MENU_CLASS
          }
          collisionPadding={16}
          // On a phone neither side of the More setup menu has room for a
          // submenu; overlap the parent so it opens over it, inside the viewport.
          sideOffset={isPhoneViewport ? -MORE_SETUP_MENU_WIDTH_PX : undefined}
        >
          {isMenuChip(chip.id) ? (
            renderMenuBody(chip.id)
          ) : (
            <TooltipProvider delayDuration={200}>
              <GenerationSetupCustomizePanel
                {...props}
                initialSection={chip.id as 'brand' | 'model' | 'presets'}
              />
            </TooltipProvider>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <div className="contents" data-testid="generation-setup-section-chips">
      {chips.map((chip) => (
        <span className="contents" key={chip.id}>
          {renderChip(chip)}
          {chip.id === 'model' ? afterModel : null}
        </span>
      ))}
      {chips.every((chip) => chip.id !== 'model') ? afterModel : null}
      {chips.length > 0 ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              ariaLabel={translate('moreSetup')}
              className={cn(
                SHELL_CONTROL_HEIGHT_CLASS,
                'hidden w-8 shrink-0 p-0 text-foreground @max-[339px]/prompt-bar:inline-flex',
              )}
              icon={
                <Ellipsis aria-hidden="true" className={SHELL_ICON_CLASS} />
              }
              isDisabled={isDisabled}
              size={ButtonSize.ICON}
              textTransform="none"
              tooltip={translate('moreSetup')}
              tooltipPosition="top"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label={translate('moreSetup')}
            className="w-56"
            collisionPadding={16}
            side="top"
            sideOffset={8}
          >
            {chips.map(renderMenuSection)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
