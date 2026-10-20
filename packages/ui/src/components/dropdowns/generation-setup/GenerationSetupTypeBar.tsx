'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupType } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import type { GenerationSetupTypeBarProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_ICON_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { Pencil, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

const SEGMENT_CLASS =
  'gen-shell-segmented flex shrink-0 gap-0.5 rounded-md p-0.5';

/**
 * The start of the prompt bar: one icon button per type, a pencil toggle that
 * turns Image into an edit, and the Auto / Advanced switch. Names are in the
 * tooltips, so the row keeps its width whichever type is chosen.
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
  const isEditing = imageEditing?.isEnabled === true;
  const isImageActive =
    setup.values.type === 'image' || setup.values.type === 'image-edit';
  // Edit is a mode of Image and Video. Video has no edit flow in Studio yet,
  // so its switch shows but stays off.
  const isVideoActive = setup.values.type === 'video';

  return (
    <TooltipProvider delayDuration={200}>
      <div
        aria-label={translate('type')}
        className={SEGMENT_CLASS}
        role="group"
      >
        {typeOptions.map((option) => {
          const isImage =
            option.value === 'image' || option.value === 'image-edit';
          const icon: GenerationSetupType = isImage ? 'image' : option.value;
          const Icon = getModelCategoryIcon(icon);
          const isActive = option.value === setup.values.type;
          return (
            <Button
              key={option.label}
              ariaLabel={option.label}
              aria-pressed={isActive}
              className="size-8 shrink-0 p-0"
              isDisabled={isDisabled}
              onClick={() => {
                if (!isActive) onTypeChange?.(option.value);
              }}
              size={ButtonSize.ICON}
              tooltip={option.label}
              tooltipPosition="top"
              variant={isActive ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
              withWrapper={false}
            >
              <Icon aria-hidden="true" className={SHELL_ICON_CLASS} />
            </Button>
          );
        })}
      </div>

      {imageEditing && (isImageActive || isVideoActive) ? (
        <Button
          ariaLabel={translate('modeEdit')}
          aria-pressed={isImageActive && isEditing}
          className={cn(
            'size-8 shrink-0 p-0',
            isImageActive && isEditing && 'text-primary',
          )}
          isDisabled={isDisabled || isVideoActive}
          onClick={() => imageEditing.onChange(!isEditing)}
          size={ButtonSize.ICON}
          tooltip={
            isVideoActive
              ? translate('modeEditVideoSoon')
              : translate('modeEdit')
          }
          tooltipPosition="top"
          variant={
            isImageActive && isEditing
              ? ButtonVariant.SECONDARY
              : ButtonVariant.GHOST
          }
          withWrapper={false}
        >
          <Pencil aria-hidden="true" className={SHELL_ICON_CLASS} />
        </Button>
      ) : null}

      {advancedMode ? (
        <div
          aria-label={translate('setupMode')}
          className={SEGMENT_CLASS}
          role="group"
        >
          {[false, true].map((isAdvanced) => {
            const isActive = advancedMode.isEnabled === isAdvanced;
            const label = translate(isAdvanced ? 'advancedMode' : 'auto');
            const Icon = isAdvanced ? SlidersHorizontal : Sparkles;
            return (
              <Button
                key={String(isAdvanced)}
                ariaLabel={label}
                aria-pressed={isActive}
                className="size-8 shrink-0 p-0"
                isDisabled={isDisabled}
                onClick={() => advancedMode.onChange(isAdvanced)}
                size={ButtonSize.ICON}
                tooltip={translate(
                  isAdvanced ? 'advancedModeTooltip' : 'autoModeTooltip',
                )}
                tooltipPosition="top"
                variant={
                  isActive ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
                }
                withWrapper={false}
              >
                <Icon aria-hidden="true" className={SHELL_ICON_CLASS} />
              </Button>
            );
          })}
        </div>
      ) : null}
    </TooltipProvider>
  );
}
