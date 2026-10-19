'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupFrontDoorProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { summarizeGenerationSetup } from '@ui/dropdowns/generation-setup/generation-setup.summary';
import ModelAvatar from '@ui/models/ModelAvatar';
import { Button } from '@ui/primitives/button';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  Bookmark,
  ChevronRight,
  Copy,
  Cpu,
  type LucideIcon,
  Megaphone,
  Palette,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';

const SECTION_ICONS: Record<
  Exclude<GenerationSetupCustomizeSectionId, 'type'>,
  LucideIcon
> = {
  model: Cpu,
  output: Copy,
  look: Palette,
  brand: Megaphone,
  presets: Bookmark,
  enhancement: SlidersHorizontal,
};

export default function GenerationSetupFrontDoor({
  activeSection,
  onCloseSection,
  renderSection,
  showPresets = true,
  showEnhancementSettings = false,
  capabilities,
  inputControls,
  isDisabled = false,
  lookOptions,
  models,
  onCustomize,
  onResetAll,
  presets,
  systemPresets = [],
  setup,
  typeOptions,
}: GenerationSetupFrontDoorProps) {
  const translate = useTranslations('agent.generationSetup');
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openCause = useRef<'hover' | 'activate'>('activate');
  const submenuRef = useRef<HTMLDivElement>(null);
  const cancelHover = useCallback((): void => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);
  useEffect(() => cancelHover, [cancelHover]);
  function activate(section: GenerationSetupCustomizeSectionId): void {
    cancelHover();
    openCause.current = 'activate';
    onCustomize(section);
    // A hover-open child is already mounted, so its auto-focus event will not fire again.
    if (activeSection === section)
      submenuRef.current
        ?.querySelector<HTMLElement>(
          'input:not([disabled]),button:not([disabled]),[tabindex="0"]',
        )
        ?.focus();
  }
  const {
    hasLookFields,
    hasOutputFields,
    modelLabel,
    outputLabel,
    selectedModel,
  } = summarizeGenerationSetup({
    autoLabel: translate('auto'),
    capabilities,
    formatDuration: (seconds) => translate('durationSeconds', { seconds }),
    inputControls,
    lookOptions,
    models,
    setup,
  });
  const TypeIcon = getModelCategoryIcon(setup.values.type, selectedModel);
  const sections: {
    id: GenerationSetupCustomizeSectionId;
    label: string;
    value?: string;
    isDisabled?: boolean;
  }[] = [
    {
      id: 'type',
      label: translate('type'),
      value:
        typeOptions.find((option) => option.value === setup.values.type)
          ?.label ?? setup.values.type,
      isDisabled: typeOptions.length < 2,
    },
  ];
  if (capabilities.hasModelSelection)
    sections.push({
      id: 'model',
      label: translate('model'),
      value: modelLabel,
    });
  if (hasOutputFields)
    sections.push({
      id: 'output',
      label: translate('output'),
      value: outputLabel,
    });
  if (hasLookFields) sections.push({ id: 'look', label: translate('look') });
  if (capabilities.hasBrandEnrichment)
    sections.push({
      id: 'brand',
      label: translate('brand'),
      value:
        setup.values.brandingMode === 'brand'
          ? translate('on')
          : translate('off'),
    });
  if (showPresets)
    sections.push({
      id: 'presets',
      label: translate('presets'),
      value:
        presets.length + systemPresets.length
          ? String(presets.length + systemPresets.length)
          : undefined,
    });
  if (showEnhancementSettings)
    sections.push({ id: 'enhancement', label: translate('enhancement') });
  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-y-auto p-1.5">
        {sections.map((section) => {
          let sectionIcon: ReactNode;
          if (section.id === 'model' && selectedModel) {
            sectionIcon = <ModelAvatar model={selectedModel} />;
          } else if (section.id === 'type') {
            sectionIcon = <TypeIcon className="size-3.5" />;
          } else {
            const Icon = SECTION_ICONS[section.id];
            sectionIcon = <Icon className="size-3.5" />;
          }
          const button = (
            <Button
              key={section.id}
              ariaLabel={translate('configureSection', {
                section: section.label,
              })}
              className="h-9 w-full justify-between gap-3 rounded-md px-2 text-xs"
              isDisabled={isDisabled || section.isDisabled}
              onClick={(event) => {
                if (renderSection) event.preventDefault();
                activate(section.id);
              }}
              onKeyDown={(event) => {
                if (renderSection && event.key === 'ArrowRight') {
                  event.preventDefault();
                  activate(section.id);
                }
              }}
              onPointerEnter={(event) => {
                cancelHover();
                if (
                  !renderSection ||
                  isDisabled ||
                  section.isDisabled ||
                  event.pointerType === 'touch'
                )
                  return;
                hoverTimer.current = setTimeout(() => {
                  hoverTimer.current = null;
                  openCause.current = 'hover';
                  onCustomize(section.id);
                }, 120);
              }}
              onPointerLeave={cancelHover}
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <span className="flex shrink-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-10 shrink-0 items-center justify-center text-muted-foreground"
                >
                  {sectionIcon}
                </span>
                {section.label}
              </span>
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span className="truncate">{section.value}</span>
                <ChevronRight className="size-3.5 shrink-0" />
              </span>
            </Button>
          );
          if (!renderSection) return button;
          return (
            <Popover
              key={section.id}
              open={activeSection === section.id}
              onOpenChange={(open) =>
                open ? activate(section.id) : onCloseSection?.()
              }
            >
              <PopoverTrigger asChild>{button}</PopoverTrigger>
              <PopoverContent
                ref={submenuRef}
                data-testid="generation-setup-submenu"
                aria-label={section.label}
                side="right"
                align="start"
                sideOffset={8}
                collisionPadding={16}
                avoidCollisions
                onFocusCapture={() => {
                  openCause.current = 'activate';
                }}
                onOpenAutoFocus={(event) => {
                  if (openCause.current === 'hover') event.preventDefault();
                }}
                onCloseAutoFocus={(event) => {
                  if (openCause.current === 'hover') event.preventDefault();
                }}
                className={`${overlayMenuSurfaceClassName} flex w-[400px] max-h-[min(560px,var(--radix-popover-content-available-height,70vh))] flex-col overflow-hidden rounded-lg p-0`}
              >
                {activeSection === section.id
                  ? renderSection(section.id)
                  : null}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-border p-1.5">
        <Button
          ariaLabel={translate('resetAllAria')}
          className="text-muted-foreground"
          icon={<RotateCcw className="size-3.5" />}
          isDisabled={isDisabled}
          label={translate('resetAll')}
          onClick={onResetAll}
          size={ButtonSize.XS}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}
