'use client';

import {
  ModalEnum,
  type QualityTier,
  type SubscriptionTier,
} from '@genfeedai/enums';
import {
  DEFAULT_QUALITY_TIER,
  hasQualityAccess,
  QUALITY_TIER_OPTIONS,
} from '@genfeedai/helpers';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import type { PromptBarQualityControlsProps } from '@genfeedai/props/studio/prompt-bar.props';
import FormDropdown from '@ui/primitives/dropdown-field';
import { type ChangeEvent, memo, useCallback } from 'react';
import { HiLockClosed, HiSparkles } from 'react-icons/hi2';

type FormWithSetValue = {
  setValue: (
    name: string,
    value: QualityTier,
    options: Record<string, boolean>,
  ) => void;
};

function buildQualityOptions(subscriptionTier?: SubscriptionTier) {
  return QUALITY_TIER_OPTIONS.map((option) => {
    const isLocked =
      subscriptionTier && !hasQualityAccess(subscriptionTier, option.value);

    return {
      badge: isLocked ? 'Upgrade' : undefined,
      badgeVariant: isLocked ? ('warning' as const) : undefined,
      description: isLocked ? 'Requires a higher plan' : option.description,
      icon: isLocked ? (
        <HiLockClosed className="w-4 h-4 text-foreground/30" />
      ) : undefined,
      key: option.value,
      label: option.label,
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
  const qualityOptions = buildQualityOptions(subscriptionTier);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as QualityTier;

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
    <FormDropdown
      name="quality"
      icon={<HiSparkles className="w-4 h-4" />}
      label="Quality"
      triggerDisplay="icon-only"
      value={watchedQuality ?? DEFAULT_QUALITY_TIER}
      isNoneEnabled={false}
      isFullWidth={false}
      className={controlClass}
      dropdownDirection="up"
      options={qualityOptions}
      onChange={handleChange}
      isDisabled={isDisabled}
    />
  );
});

export default PromptBarQualityControls;
