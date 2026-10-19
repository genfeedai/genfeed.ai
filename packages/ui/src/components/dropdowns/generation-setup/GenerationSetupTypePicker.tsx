'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupType } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelCategoryIcon } from '@genfeedai/helpers/ui/icons/model-category-icon';
import type { GenerationSetupTypePickerProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

/** What to make. Auto mode's whole setup; Advanced mode shows the same tiles above its rows. */
export default function GenerationSetupTypePicker({
  hasHint = false,
  imageEditing,
  isDisabled = false,
  onTypeChange,
  setup,
  typeOptions,
}: GenerationSetupTypePickerProps) {
  const translate = useTranslations('agent.generationSetup');
  const isEditing = imageEditing?.isEnabled === true;
  const options: {
    icon: GenerationSetupType;
    isActive: boolean;
    label: string;
    onSelect: () => void;
  }[] = typeOptions.map((option) => {
    const isImage = option.value === 'image' || option.value === 'image-edit';
    return {
      icon: isImage ? 'image' : option.value,
      // Exactly one tile is active: Image yields to Edit image while editing.
      isActive: option.value === setup.values.type && !(isImage && isEditing),
      label: option.label,
      onSelect: () => {
        if (isImage && isEditing) imageEditing?.onChange(false);
        else if (option.value !== setup.values.type)
          onTypeChange?.(option.value);
      },
    };
  });
  if (imageEditing) {
    const imageIndex = options.findIndex((option) => option.icon === 'image');
    options.splice(imageIndex + 1, 0, {
      icon: 'image-edit',
      isActive: isEditing,
      label: imageEditing.label,
      onSelect: () => imageEditing.onChange(true),
    });
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div
        aria-label={translate('type')}
        className="grid grid-cols-3 gap-1.5"
        role="group"
      >
        {options.map((option) => {
          const Icon = getModelCategoryIcon(option.icon);
          return (
            <Button
              key={option.label}
              aria-pressed={option.isActive}
              className={cn(
                'h-16 flex-col justify-center gap-1.5 rounded-md border text-xs',
                option.isActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
              isDisabled={isDisabled}
              onClick={option.onSelect}
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <Icon aria-hidden="true" className="size-4" />
              {option.label}
            </Button>
          );
        })}
      </div>
      {hasHint ? (
        <p className="text-center text-xs text-muted-foreground">
          {translate('autoHint')}
        </p>
      ) : null}
    </div>
  );
}
