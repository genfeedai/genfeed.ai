'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ExpertStepActionsProps } from '@/features/onboarding/props/expert-path.props';

export default function ExpertStepActions({
  continueLabel,
  isContinueDisabled = false,
  isSubmitting = false,
  onContinue,
  onSkip,
}: ExpertStepActionsProps) {
  const translate = useTranslations('pages.onboarding.expert.common');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.DEFAULT}
          label={continueLabel ?? translate('continue')}
          icon={<ArrowRight className="size-4" />}
          isDisabled={isContinueDisabled}
          isLoading={isSubmitting}
          onClick={onContinue}
        />
        {onSkip ? (
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.DEFAULT}
            label={translate('skip')}
            isDisabled={isSubmitting}
            onClick={onSkip}
          />
        ) : null}
      </div>
      {onSkip ? (
        <p className="text-xs text-muted-foreground">{translate('skipHint')}</p>
      ) : null}
    </div>
  );
}
