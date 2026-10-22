'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupType } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import type { GenerationSetupTypeBarProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  PROMPT_BAR_CHIP_CLASS,
  PROMPT_BAR_CHIP_FIT_CLASS,
  PROMPT_BAR_CHIP_LABEL_CLASS,
  SHELL_ICON_CLASS,
} from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { ChevronDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

function toIconType(type: GenerationSetupType): GenerationSetupType {
  return type === 'image-edit' ? 'image' : type;
}

/**
 * The start of the prompt bar: a Type chip whose menu lists what to generate
 * and holds Edit (a mode of Image), then the Auto / Advanced button, which
 * shows the current mode and switches to the other. Both are ghost chips like
 * every other control on the row.
 */
export default function GenerationSetupTypeBar({
  advancedMode,
  imageEditing,
  isDisabled = false,
  onTypeChange,
  setup,
  typeOptions,
}: GenerationSetupTypeBarProps) {
  const translate = useTranslations('agent.generationSetup');
  const currentType = setup.values.type;
  const isImageActive = currentType === 'image' || currentType === 'image-edit';
  // Edit is a mode of Image and Video. Video has no edit flow in Studio yet,
  // so its toggle shows but stays off.
  const isVideoActive = currentType === 'video';
  const isEditing = imageEditing?.isEnabled === true && isImageActive;
  const activeOption =
    typeOptions.find((option) => option.value === currentType) ??
    typeOptions.find((option) => toIconType(option.value) === currentType);
  const ActiveIcon = getModelCategoryIcon(toIconType(currentType));
  const activeLabel = activeOption?.label ?? currentType;
  const triggerLabel = isEditing
    ? `${activeLabel} · ${translate('modeEdit')}`
    : activeLabel;
  const isTypeLocked = typeOptions.length <= 1;
  const isAdvanced = advancedMode?.isEnabled === true;
  const ModeIcon = isAdvanced ? SlidersHorizontal : Sparkles;
  const modeLabel = translate(isAdvanced ? 'advancedMode' : 'auto');

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ariaLabel={translate('generationTypeTrigger', {
              type: triggerLabel,
            })}
            className={cn(PROMPT_BAR_CHIP_CLASS, PROMPT_BAR_CHIP_FIT_CLASS)}
            icon={
              <ActiveIcon aria-hidden="true" className={SHELL_ICON_CLASS} />
            }
            isDisabled={isDisabled || isTypeLocked}
            size={ButtonSize.SM}
            textTransform="none"
            tooltip={translate('generationTypeTrigger', { type: triggerLabel })}
            tooltipPosition="top"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <span className={PROMPT_BAR_CHIP_LABEL_CLASS}>{triggerLabel}</span>
            {isTypeLocked ? null : (
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-3 text-muted-foreground',
                  PROMPT_BAR_CHIP_LABEL_CLASS,
                )}
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          aria-label={translate('type')}
          className="w-44"
          side="top"
          sideOffset={8}
        >
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              const next = typeOptions.find((option) => option.value === value);
              if (next && next.value !== currentType) {
                onTypeChange?.(next.value);
              }
            }}
            value={activeOption?.value ?? currentType}
          >
            {typeOptions.map((option) => {
              const Icon = getModelCategoryIcon(toIconType(option.value));
              return (
                <DropdownMenuRadioItem key={option.label} value={option.value}>
                  <span className="flex items-center gap-2 text-xs">
                    <Icon
                      aria-hidden="true"
                      className={cn(SHELL_ICON_CLASS, 'text-muted-foreground')}
                    />
                    {option.label}
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
          {imageEditing && (isImageActive || isVideoActive) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={isEditing}
                disabled={isVideoActive}
                onCheckedChange={(isChecked) =>
                  imageEditing.onChange(isChecked)
                }
              >
                <span className="text-xs">{translate('modeEdit')}</span>
                {isVideoActive ? (
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">
                    {translate('modeEditVideoSoon')}
                  </span>
                ) : null}
              </DropdownMenuCheckboxItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {advancedMode ? (
        <Button
          ariaLabel={translate('setupModeSwitch', { mode: modeLabel })}
          className={cn(PROMPT_BAR_CHIP_CLASS, PROMPT_BAR_CHIP_FIT_CLASS)}
          icon={<ModeIcon aria-hidden="true" className={SHELL_ICON_CLASS} />}
          isDisabled={isDisabled}
          onClick={() => advancedMode.onChange(!isAdvanced)}
          size={ButtonSize.SM}
          textTransform="none"
          tooltip={translate(
            isAdvanced ? 'advancedModeTooltip' : 'autoModeTooltip',
          )}
          tooltipPosition="top"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span className={PROMPT_BAR_CHIP_LABEL_CLASS}>{modeLabel}</span>
        </Button>
      ) : null}
    </TooltipProvider>
  );
}
