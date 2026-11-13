import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { FirstDraftMissingCardProps } from '@/features/onboarding/props/first-drafts.props';

/** Stands in for a channel whose post could not be written, so the slot is never silently empty. */
export default function MissingDraftCard({
  isBusy,
  isRewriting,
  onRewrite,
  platform,
  rewritesRemaining,
}: FirstDraftMissingCardProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  return (
    <div
      data-testid={`onboarding-draft-missing-${platform}`}
      className="flex min-w-0 flex-col gap-3 rounded-md border border-dashed border-border p-4"
    >
      <h3 className="text-sm font-medium">{t(`platforms.${platform}`)}</h3>
      <p className="text-sm text-muted-foreground">{t('review.leftOut')}</p>
      {rewritesRemaining > 0 ? (
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          label={t(isRewriting ? 'review.writingAnother' : 'review.tryAgain')}
          isDisabled={isBusy}
          isLoading={isRewriting}
          onClick={() => onRewrite(platform)}
        />
      ) : null}
    </div>
  );
}
