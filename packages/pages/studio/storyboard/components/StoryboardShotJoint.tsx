'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardShotJointProps } from '@genfeedai/props/studio/storyboard.props';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The seam between two shots: how they join, and where to insert another. */
export default function StoryboardShotJoint({
  canAddShot,
  index,
  interpolationAvailable,
  isDisabled,
  onAddShot,
  onChangeTransition,
  transition,
}: StoryboardShotJointProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const ordinal = index + 1;
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="w-40">
        <StoryboardSelect
          ariaLabel={translate('shotTransition', { ordinal })}
          value={transition}
          placeholder={translate('chooseTransition')}
          isDisabled={isDisabled}
          options={[
            { value: 'cut', label: translate('cut') },
            { value: 'stitch', label: translate('stitch') },
            ...(interpolationAvailable
              ? [{ value: 'interpolate', label: translate('interpolate') }]
              : []),
          ]}
          onChange={(value) => {
            if (
              value === 'cut' ||
              value === 'stitch' ||
              value === 'interpolate'
            )
              onChangeTransition(value);
          }}
        />
      </div>
      <Button
        ariaLabel={translate('addShotAfter', { ordinal })}
        icon={<Plus className="size-4" />}
        isDisabled={isDisabled || !canAddShot}
        onClick={onAddShot}
        size={ButtonSize.ICON}
        tooltip={translate('addShotAfter', { ordinal })}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      />
    </div>
  );
}
