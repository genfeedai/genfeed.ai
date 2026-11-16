import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { FirstDraftsUnderstoodLineProps } from '@/features/onboarding/props/first-drafts.props';

export default function UnderstoodLine({
  canRedo,
  isBusy,
  maxRounds,
  onNotRight,
  round,
  understood,
}: FirstDraftsUnderstoodLineProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const offer = understood?.offer;
  const audience = understood?.audience;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {offer || audience ? (
        <p role="status" className="text-sm">
          {offer && audience
            ? t('review.understood.both', { audience, offer })
            : offer
              ? t('review.understood.offer', { offer })
              : t('review.understood.audience', { audience: audience ?? '' })}
        </p>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {t('review.round', { max: maxRounds, round })}
        </span>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          label={t('review.notRight')}
          isDisabled={!canRedo || isBusy}
          onClick={onNotRight}
        />
      </div>
    </div>
  );
}
