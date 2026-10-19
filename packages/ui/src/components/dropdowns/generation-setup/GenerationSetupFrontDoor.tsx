'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupFrontDoorProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
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
  type LucideIcon,
  Megaphone,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';

const SECTION_ICONS: Partial<
  Record<GenerationSetupCustomizeSectionId, LucideIcon>
> = {
  brand: Megaphone,
  presets: Bookmark,
};

export default function GenerationSetupFrontDoor({
  activeSection,
  onCloseSection,
  renderSection,
  showPresets = true,
  showEnhancementSettings = false,
  capabilities,
  isDisabled = false,
  onCustomize,
  presets,
  systemPresets = [],
  setup,
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
  const sections: {
    id: GenerationSetupCustomizeSectionId;
    label: string;
    value?: string;
  }[] = [];
  if (capabilities.hasBrandEnrichment || showEnhancementSettings)
    sections.push({
      id: 'brand',
      label: translate('brand'),
      value: capabilities.hasBrandEnrichment
        ? setup.values.brandingMode === 'brand'
          ? translate('on')
          : translate('off')
        : undefined,
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
  if (sections.length === 0) return null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-y-auto border-t border-border p-1.5">
        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const sectionIcon: ReactNode = Icon ? (
            <Icon className="size-3.5" />
          ) : null;
          const button = (
            <Button
              key={section.id}
              ariaLabel={translate('configureSection', {
                section: section.label,
              })}
              className="h-9 w-full justify-between gap-3 rounded-md px-2 text-xs"
              isDisabled={isDisabled}
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
    </div>
  );
}
