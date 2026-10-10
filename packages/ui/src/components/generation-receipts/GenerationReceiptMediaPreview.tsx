'use client';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import type { GenerationReceiptMediaPreviewProps } from '@genfeedai/props/content/branded-generation-receipt.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Film, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** The output's authorized preview, linked to the full asset once ready. */
export default function GenerationReceiptMediaPreview({
  ingredient,
  label,
}: GenerationReceiptMediaPreviewProps) {
  const t = useTranslations('pages.generationReceipts.list');
  const grant = useAuthorizedMediaPreview(ingredient);
  const isVideo = isVideoIngredient(ingredient);
  // A pending or failed grant never falls back to a retained raw URL.
  const assetUrl = grant
    ? grant.state === 'READY'
      ? grant.url
      : null
    : ingredient.ingredientUrl || null;
  const imageUrl = isVideo
    ? undefined
    : grant
      ? assetUrl && isRasterPreviewUrl(assetUrl)
        ? assetUrl
        : undefined
      : getIngredientPreviewUrl(ingredient);
  const preview =
    isVideo && assetUrl ? (
      <VideoPlayer
        ariaLabel={label}
        className="size-full"
        config={{
          controls: false,
          loop: false,
          muted: true,
          playsInline: true,
          preload: 'metadata',
        }}
        mediaClassName="object-cover"
        mediaProps={{ tabIndex: -1 }}
        src={`${assetUrl.split('#')[0]}#t=0.001`}
      />
    ) : imageUrl ? (
      <Image
        alt={label}
        className="object-cover"
        fill
        sizes="64px"
        src={imageUrl}
        unoptimized={!canOptimizeImageSource(imageUrl)}
      />
    ) : isVideo ? (
      <Film aria-hidden="true" className="size-5 text-foreground/30" />
    ) : (
      <ImageIcon aria-hidden="true" className="size-5 text-foreground/30" />
    );
  return assetUrl ? (
    <Link
      aria-label={t('openOutput')}
      className="relative flex size-full items-center justify-center"
      href={assetUrl}
      rel="noreferrer"
      target="_blank"
    >
      {preview}
    </Link>
  ) : (
    preview
  );
}
