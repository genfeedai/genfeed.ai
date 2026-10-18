'use client';

import type { MotionQuoteReviewProps } from '@genfeedai/props/studio/motion-composer.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * The credit-ceiling approval. It renders as the prompt bar's banner, so the
 * quote the creator confirms stays inside the bar they asked it from.
 */
export default function MotionQuoteReview({
  isAcknowledged,
  isBusy,
  isVisionUnverified,
  onAcknowledgedChange,
  onConfirm,
  review,
}: MotionQuoteReviewProps): ReactElement {
  const t = useTranslations('pages.studioMotion');
  const { quote } = review;

  return (
    <section
      aria-label={t('reviewQuote')}
      className="grid gap-3 text-sm"
      data-testid="motion-quote-review"
    >
      <p className="font-medium">{t('reviewQuote')}</p>
      <p>
        {quote.modelKey}
        {quote.isByok ? ' · BYOK' : ''} · {quote.settings.width}×
        {quote.settings.height} ·{' '}
        {quote.outputRequests
          .map(
            (output) =>
              `${output.format}${output.frame === undefined ? '' : ` @${output.frame}`}`,
          )
          .join(', ')}
      </p>
      <dl className="grid grid-cols-2 gap-2">
        <dt>{t('authoring')}</dt>
        <dd>{quote.authoringCredits}</dd>
        <dt>{t('inspection')}</dt>
        <dd>{quote.inspectionCredits}</dd>
        <dt>{t('rendering')}</dt>
        <dd>{quote.renderCredits}</dd>
        <dt>{t('maximum')}</dt>
        <dd>{quote.maximumCredits}</dd>
      </dl>
      <p className="text-muted-foreground">{t('billingHint')}</p>
      {isVisionUnverified ? <p>{t('unverifiedVision')}</p> : null}
      <label className="flex items-start gap-2">
        <Checkbox
          aria-label={t('acknowledge', { maximum: quote.maximumCredits })}
          checked={isAcknowledged}
          onCheckedChange={(isChecked) =>
            onAcknowledgedChange(isChecked === true)
          }
        />
        {t('acknowledge', { maximum: quote.maximumCredits })}
      </label>
      <div>
        <Button isDisabled={!isAcknowledged || isBusy} onClick={onConfirm}>
          {isBusy ? t('submitting') : t('confirm')}
        </Button>
      </div>
    </section>
  );
}
