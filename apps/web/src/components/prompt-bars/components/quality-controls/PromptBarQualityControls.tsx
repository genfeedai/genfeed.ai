'use client';

import {
  ModalEnum,
  type QualityTier,
  type SubscriptionTier,
} from '@genfeedai/contracts';
import {
  DEFAULT_QUALITY_TIER,
  hasQualityAccess,
  QUALITY_TIER_OPTIONS,
} from '@genfeedai/helpers';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import type { PromptBarQualityControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import { OptionSelect } from '@ui/primitives/option-select';
import { Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';

type FormWithSetValue = {
  setValue: (
    name: string,
    value: QualityTier,
    options: Record<string, boolean>,
  ) => void;
};

function buildQualityOptions(
  translate: (key: 'qualityNeedsPlan', values: { label: string }) => string,
  subscriptionTier?: SubscriptionTier,
) {
  return QUALITY_TIER_OPTIONS.map((option) => {
    const isLocked =
      subscriptionTier && !hasQualityAccess(subscriptionTier, option.value);

    return {
      ariaLabel: isLocked
        ? translate('qualityNeedsPlan', { label: option.label })
        : undefined,
      icon: isLocked ? (
        <Lock className="size-4 text-muted-foreground" />
      ) : undefined,
      label: option.label,
      value: option.value,
    };
  });
}

const PromptBarQualityControls = memo(function PromptBarQualityControls({
  watchedQuality,
  controlClass,
  isDisabled,
  form,
  triggerConfigChange,
  subscriptionTier,
}: PromptBarQualityControlsProps): React.ReactElement {
  const translate = useTranslations('ui.promptBarControls');
  const qualityOptions = buildQualityOptions(translate, subscriptionTier);

  const updatePromptBarQualityControls = useCallback(
    (nextValue: string) => {
      const value = nextValue as QualityTier;

      // If user clicks a locked tier, open upgrade modal instead
      if (subscriptionTier && !hasQualityAccess(subscriptionTier, value)) {
        openModal(ModalEnum.UPGRADE_PROMPT);
        return;
      }

      (form as FormWithSetValue).setValue('quality', value, {
        shouldDirty: false,
        shouldValidate: false,
      });
      triggerConfigChange();
    },
    [form, triggerConfigChange, subscriptionTier],
  );

  return (
    <OptionSelect
      ariaLabel={translate('quality')}
      className={controlClass}
      icon={<Sparkles className="size-4" />}
      isDisabled={isDisabled}
      isIconOnly
      onValueChange={updatePromptBarQualityControls}
      options={qualityOptions}
      value={watchedQuality ?? DEFAULT_QUALITY_TIER}
    />
  );
});

export default PromptBarQualityControls;
