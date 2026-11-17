'use client';

import { TargetExecutionState } from '@genfeedai/contracts';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { useTranslations } from 'next-intl';
import type { TargetPreviewProps } from '@/props/ui/previews.props';
import { buildTargetPreview } from './preview.helpers';

export default function TargetPreview({
  className,
  presentation,
  ...props
}: TargetPreviewProps) {
  const translate = useTranslations('pages.publishing.release.details');
  const isPublished =
    props.target.executionState === TargetExecutionState.PUBLISHED;
  return (
    <PlatformPreview
      className={className}
      presentation={presentation}
      showValidation={!isPublished}
      statusLabel={isPublished ? translate('published') : undefined}
      target={buildTargetPreview(props)}
    />
  );
}
