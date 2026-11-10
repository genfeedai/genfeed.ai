'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ASSET_ORIGINAL_FORMAT_SVG } from '@genfeedai/contracts/constants';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BrandKitSlotTileProps } from '@/features/brands/props/brand-kit-slots.props';
import BrandLogoDownloadMenu from './BrandLogoDownloadMenu';

/** Widest preview ratio; a 6:1 cover still reads as a picture, not a line. */
const MAX_PREVIEW_RATIO = 4;

/**
 * One brand kit slot: a logo variant or a platform image. The preview keeps
 * the slot's own shape, so an empty X header and an empty profile photo look
 * like what they will hold.
 */
export default function BrandKitSlotTile({
  spec,
  asset,
  imageUrl,
  isManager,
  isDefault = false,
  isFilling = false,
  onUpload,
  onFillFromMaster,
  onDownload,
  isDownloading = false,
}: BrandKitSlotTileProps) {
  const t = useTranslations('pages.brandKitSettings.slots');
  // Keyed by URL, so a replacement image gets its own chance to load.
  const [failedUrl, setFailedUrl] = useState<string>();
  const label = t(`slot.${spec.slot}`);
  const platformSpec = 'width' in spec ? spec : undefined;
  const ratio = platformSpec
    ? Math.min(platformSpec.width / platformSpec.height, MAX_PREVIEW_RATIO)
    : 1;
  const hasPreview = Boolean(imageUrl) && imageUrl !== failedUrl;

  return (
    <figure
      className="flex min-w-0 flex-col gap-2"
      aria-label={label}
      data-slot={spec.slot}
    >
      <span
        className="relative flex w-full items-center justify-center overflow-hidden rounded-md bg-tertiary shadow-border"
        style={{ aspectRatio: String(ratio) }}
      >
        {hasPreview && imageUrl ? (
          <Image
            alt={label}
            className={
              platformSpec
                ? 'size-full object-cover'
                : 'size-full object-contain p-3'
            }
            fill
            sizes="320px"
            src={imageUrl}
            unoptimized
            onError={() => setFailedUrl(imageUrl)}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 p-2 text-center text-2xs text-muted-foreground">
            <ImageOff className="size-4" />
            {t('empty')}
          </span>
        )}
      </span>
      <figcaption className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium">{label}</span>
          {isDefault ? <Badge variant="secondary">{t('default')}</Badge> : null}
        </span>
        {platformSpec ? (
          <span className="text-2xs text-muted-foreground">
            {t('size', {
              height: platformSpec.height,
              width: platformSpec.width,
            })}
            {platformSpec.safeArea
              ? ` · ${t('safeArea', {
                  height: platformSpec.safeArea.height,
                  width: platformSpec.safeArea.width,
                })}`
              : ''}
          </span>
        ) : null}
        {isManager || (asset && onDownload) ? (
          <span className="flex flex-wrap gap-1">
            {isManager ? (
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                ariaLabel={`${asset ? t('replace') : t('upload')} ${label}`}
                onClick={onUpload}
              >
                {asset ? t('replace') : t('upload')}
              </Button>
            ) : null}
            {asset && onDownload ? (
              <BrandLogoDownloadMenu
                label={label}
                hasVector={asset.originalFormat === ASSET_ORIGINAL_FORMAT_SVG}
                isDisabled={isDownloading}
                onDownload={onDownload}
              />
            ) : null}
            {isManager && onFillFromMaster ? (
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                ariaLabel={`${t('fillFromMaster')} ${label}`}
                isDisabled={isFilling}
                onClick={onFillFromMaster}
              >
                {t('fillFromMaster')}
              </Button>
            ) : null}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
