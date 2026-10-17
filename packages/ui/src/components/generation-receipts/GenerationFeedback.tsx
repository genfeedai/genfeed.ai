'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  BRANDED_GENERATION_FEEDBACK_REASONS,
  type BrandedGenerationFeedbackReadV1,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import type { GenerationFeedbackProps } from '@genfeedai/props/content/branded-generation-receipt.props';
import { useGenerationFeedback } from '@hooks/ui/generation-receipts/use-generation-feedback';
import { Button } from '@ui/primitives/button';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Reason = BrandedGenerationFeedbackReadV1['reasons'][number];

const REASON_LABEL_KEYS: Record<Reason, string> = {
  off_voice: 'reasonOffVoice',
  other: 'reasonOther',
  too_generic: 'reasonTooGeneric',
  too_long: 'reasonTooLong',
  wrong_facts: 'reasonWrongFacts',
};

/**
 * Thumbs up/down on one generation, keyed by its receipt (#5786). A thumbs down
 * opens a few reason chips; both save as they are tapped.
 */
export default function GenerationFeedback(props: GenerationFeedbackProps) {
  const t = useTranslations('ui.generationFeedback');
  const { feedback, hasError, isSaving, rate, toggleReason } =
    useGenerationFeedback(props);
  const rating = feedback?.rating ?? null;
  const isDisabled = feedback === null || isSaving;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t('prompt')}</span>
        <Button
          aria-pressed={rating === 'up'}
          ariaLabel={t('thumbsUp')}
          icon={<ThumbsUp className="size-3.5" />}
          isDisabled={isDisabled}
          onClick={() => rate('up')}
          size={ButtonSize.MICRO}
          variant={
            rating === 'up' ? ButtonVariant.DEFAULT : ButtonVariant.GHOST
          }
        />
        <Button
          aria-pressed={rating === 'down'}
          ariaLabel={t('thumbsDown')}
          icon={<ThumbsDown className="size-3.5" />}
          isDisabled={isDisabled}
          onClick={() => rate('down')}
          size={ButtonSize.MICRO}
          variant={
            rating === 'down' ? ButtonVariant.DEFAULT : ButtonVariant.GHOST
          }
        />
        {rating !== null && !hasError ? (
          <span className="text-xs text-muted-foreground" role="status">
            {t('saved')}
          </span>
        ) : null}
        {hasError ? (
          <span className="text-xs text-destructive" role="alert">
            {t('failed')}
          </span>
        ) : null}
      </div>
      {rating === 'down' ? (
        <div
          aria-label={t('reasonsLabel')}
          className="flex flex-wrap items-center gap-1.5"
          role="group"
        >
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            {t('reasonsPrompt')}
          </span>
          {BRANDED_GENERATION_FEEDBACK_REASONS.map((reason) => (
            <Button
              aria-pressed={feedback?.reasons.includes(reason) ?? false}
              isDisabled={isSaving}
              key={reason}
              label={t(REASON_LABEL_KEYS[reason])}
              onClick={() => toggleReason(reason)}
              size={ButtonSize.XS}
              textTransform="none"
              variant={
                feedback?.reasons.includes(reason)
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.GHOST
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
