'use client';

import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import Image from 'next/image';
import type { ReactElement } from 'react';

export interface SelectedAvatarPreviewProps {
  description: string;
  imageAlt: string;
  imageUrl: string;
  title: string;
  wrapperClassName?: string;
}

export default function SelectedAvatarPreview({
  description,
  imageAlt,
  imageUrl,
  title,
  wrapperClassName,
}: SelectedAvatarPreviewProps): ReactElement {
  return (
    <InsetSurface
      className={
        wrapperClassName
          ? `flex items-center gap-3 ${wrapperClassName}`
          : 'flex items-center gap-3'
      }
      density="compact"
    >
      <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
        <Image
          alt={imageAlt}
          className="object-cover"
          fill
          sizes="56px"
          src={imageUrl}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </InsetSurface>
  );
}
