'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  GenerationSetupCustomizeSectionId,
  GenerationSetupSectionChipsProps,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { usePromptBarRowFit } from '@hooks/prompt-bar/use-prompt-bar-row-fit/use-prompt-bar-row-fit';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import GenerationSetupCustomizePanel from '@ui/dropdowns/generation-setup/GenerationSetupCustomizePanel';
import { summarizeGenerationSetup } from '@ui/dropdowns/generation-setup/generation-setup.summary';
import ModelAvatar from '@ui/models/ModelAvatar';
import { Button } from '@ui/primitives/button';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { Copy, Cpu, Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';

/**
 * Advanced mode's setup, one level deep: Model, Output and Look sit in the
 * toolbar as chips, each opening only its own section. The row stays on one
 * line; when it runs out of room the chips keep their icons and drop their
 * labels, which stay in the tooltip.
 */
export default function GenerationSetupSectionChips(
  props: GenerationSetupSectionChipsProps,
) {
  const {
    capabilities,
    inputControls,
    isDisabled = false,
    lookOptions,
    models,
    setup,
  } = props;
  const translate = useTranslations('agent.generationSetup');
  const rowRef = useRef<HTMLDivElement>(null);
  const [openSection, setOpenSection] =
    useState<GenerationSetupCustomizeSectionId>();
  const summary = summarizeGenerationSetup({
    autoLabel: translate('auto'),
    capabilities,
    formatDuration: (seconds) => translate('durationSeconds', { seconds }),
    inputControls,
    lookOptions,
    models,
    setup,
  });

  const chips: {
    icon: ReactNode;
    id: GenerationSetupCustomizeSectionId;
    label: string;
    value: string;
  }[] = [];
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
      icon: <Copy aria-hidden="true" className={SHELL_ICON_CLASS} />,
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

  const { isCompact } = usePromptBarRowFit({
    contentKey: chips.map((chip) => `${chip.id}:${chip.value}`).join('|'),
    rowRef,
  });

  if (chips.length === 0) return null;

  return (
    <div
      className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden"
      data-compact={isCompact ? 'true' : undefined}
      data-testid="generation-setup-section-chips"
      ref={rowRef}
    >
      {chips.map((chip) => (
        <Popover
          key={chip.id}
          onOpenChange={(isOpen) =>
            setOpenSection(isOpen && !isDisabled ? chip.id : undefined)
          }
          open={openSection === chip.id}
        >
          <PopoverTrigger asChild>
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
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label={chip.label}
            avoidCollisions
            className={cn(
              overlayMenuSurfaceClassName,
              'flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0 sm:w-[400px]',
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
                  initialSection={chip.id}
                  onBack={() => setOpenSection(undefined)}
                />
              ) : null}
            </TooltipProvider>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
