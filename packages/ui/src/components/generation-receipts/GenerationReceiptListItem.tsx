'use client';
import { ComponentSize } from '@genfeedai/contracts';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import type {
  GenerationReceiptListItemProps,
  GenerationReceiptMediaPreviewProps,
  GenerationReceiptStatusKey,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import type { BadgeProps } from '@genfeedai/props/ui/display/badge.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { format } from 'date-fns';
import { FileText, Film, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  getGenerationReceiptCost,
  getGenerationReceiptStatus,
} from './generation-receipt-summary.util';

const STATUS_VARIANT: Readonly<
  Record<GenerationReceiptStatusKey, BadgeProps['variant']>
> = {
  pending: 'info',
  completed: 'success',
  needsReview: 'warning',
  blocked: 'warning',
  failed: 'error',
  cancelled: 'secondary',
};

/** The output's authorized preview, linked to the full asset once ready. */
function GenerationReceiptMediaPreview({
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

/**
 * One saved generation in the receipts list: what was made, its status, the
 * model and recorded credit cost, and a preview of a Studio media output.
 */
export default function GenerationReceiptListItem({
  receipt,
  href,
  media,
}: GenerationReceiptListItemProps) {
  const t = useTranslations('pages.generationReceipts.list');
  const status = getGenerationReceiptStatus(receipt.state);
  const cost = getGenerationReceiptCost(receipt);
  const kind =
    receipt.contentType === 'image' || receipt.contentType === 'video'
      ? receipt.contentType
      : 'text';
  const kindLabel = t(`kind.${kind}`);
  const costLabel =
    cost.status === 'known'
      ? t('credits', { count: cost.credits })
      : t(`cost.${cost.status}`);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/4">
        {media ? (
          <GenerationReceiptMediaPreview ingredient={media} label={kindLabel} />
        ) : kind === 'video' ? (
          <Film aria-hidden="true" className="size-5 text-foreground/30" />
        ) : kind === 'image' ? (
          <ImageIcon aria-hidden="true" className="size-5 text-foreground/30" />
        ) : (
          <FileText aria-hidden="true" className="size-5 text-foreground/30" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={href}
          >
            {`${kindLabel} · ${receipt.id}`}
          </Link>
          <Badge size={ComponentSize.SM} variant={STATUS_VARIANT[status]}>
            {t(`status.${status}`)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('model', { model: receipt.execution?.model ?? t('noModel') })} ·{' '}
          {costLabel} ·{' '}
          <time dateTime={receipt.createdAt}>
            {format(new Date(receipt.createdAt), 'PP p')}
          </time>
        </p>
      </div>
    </li>
  );
}
