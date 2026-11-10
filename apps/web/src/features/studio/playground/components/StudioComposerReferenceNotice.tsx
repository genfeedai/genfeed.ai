'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StudioComposerReferenceNoticeProps } from '@/features/studio/props/studio-playground-composer.props';

/** Says which reference rule blocks Generate, the first one that applies. */
export default function StudioComposerReferenceNotice({
  isAudioReferenceInvalid,
  isFirstFrameMissing,
  isKling4KReferenceInvalid,
  isReferenceCombinationInvalid,
}: StudioComposerReferenceNoticeProps): ReactElement | null {
  const translate = useTranslations('pages.studioPlayground');
  if (
    !isAudioReferenceInvalid &&
    !isFirstFrameMissing &&
    !isReferenceCombinationInvalid &&
    !isKling4KReferenceInvalid
  ) {
    return null;
  }
  return (
    <p aria-live="polite" className="mt-1 text-xs font-medium text-destructive">
      {isAudioReferenceInvalid
        ? translate('audioReferenceUnsupported')
        : isFirstFrameMissing
          ? translate('startFrameRequired')
          : isReferenceCombinationInvalid
            ? translate('seedanceReferenceConflict')
            : translate('kling4KReferenceConflict')}
    </p>
  );
}
