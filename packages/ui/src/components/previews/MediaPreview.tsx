'use client';

import type { PreviewMediaAspect } from '@genfeedai/contracts/constants/platform-limits.constant';
import type { IReleaseMediaReference } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { getMediaAspectClassName } from './PreviewShell';

export interface MediaPreviewProps {
  media: IReleaseMediaReference[];
  aspect: PreviewMediaAspect;
  className?: string;
}

export default function MediaPreview({
  media,
  aspect,
  className,
}: MediaPreviewProps) {
  const translate = useTranslations('common.previews');

  if (media.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative mt-3 overflow-hidden rounded-lg bg-muted',
        getMediaAspectClassName(aspect),
        className,
      )}
      data-media-aspect={aspect}
      data-testid="preview-media"
    >
      {media[0]?.url ? (
        <Image
          alt={translate('mediaAlt')}
          className="object-cover outline-media"
          fill
          sizes="(max-width: 768px) 100vw, 480px"
          src={media[0].url}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs capitalize text-foreground/50">
          {media[0]?.kind ?? translate('mediaAlt')}
        </div>
      )}
      {media.length > 1 ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white">
          +{media.length - 1}
        </span>
      ) : null}
    </div>
  );
}
