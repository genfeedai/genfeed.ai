'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardSaveIndicatorProps } from '@genfeedai/props/studio/storyboard.props';
import { Button } from '@ui/primitives/button';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function StoryboardSaveIndicator({
  status,
  error,
  onRetry,
}: StoryboardSaveIndicatorProps) {
  const translate = useTranslations('pages.studioStoryboard.save');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-muted-foreground"
      >
        {status === 'saved' ? (
          <Check className="size-3.5" />
        ) : status === 'failed' ? (
          <CircleAlert className="size-3.5" />
        ) : status === 'saving' ? (
          <LoaderCircle className="size-3.5" />
        ) : null}
        {translate(status)}
      </span>
      {status === 'failed' ? (
        <>
          <span role="alert" className="break-words text-destructive">
            {error || translate('keptLocally')}
          </span>
          <Button
            label={translate('retry')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={onRetry}
          />
        </>
      ) : null}
    </div>
  );
}
