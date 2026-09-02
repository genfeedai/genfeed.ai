'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { BrandKitAssetTileProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { Check, ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

/**
 * A brand kit asset is a picture, so it is reviewed as a picture. Crawled
 * candidates point at arbitrary third-party hosts that are not in the Next
 * image `remotePatterns` allowlist, so previews render `unoptimized` and fall
 * back to a labelled placeholder when the host refuses the request.
 */
export default function BrandKitAssetTile({
  asset,
  isSelectable = false,
  isSelected = false,
  onToggle,
  sourceUrl,
  statusLabel,
}: BrandKitAssetTileProps) {
  const [hasPreviewError, setHasPreviewError] = useState(false);

  const previewUrl = asset.url ?? sourceUrl;
  const caption = asset.label ?? asset.role;
  const dimensions =
    asset.width && asset.height ? `${asset.width}×${asset.height}` : '';
  const hasPreview = Boolean(previewUrl) && !hasPreviewError;

  const handlePreviewError = () => {
    try {
      if (previewUrl && new URL(previewUrl).hostname === 'img.logo.dev') {
        logger.warn('Logo.dev brand logo preview unavailable', {
          provider: 'logo.dev',
          role: asset.role,
          sourceType: asset.sourceType,
        });
      }
    } catch {
      // A malformed preview URL follows the same harmless placeholder path.
    }

    setHasPreviewError(true);
  };

  const preview = (
    <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-background-tertiary shadow-border">
      {hasPreview && previewUrl ? (
        <Image
          alt={caption}
          className="size-full object-contain p-2"
          fill
          sizes="160px"
          src={previewUrl}
          unoptimized
          onError={handlePreviewError}
        />
      ) : (
        <span className="flex flex-col items-center gap-1 p-2 text-center text-2xs leading-tight text-muted-foreground">
          <ImageOff className="size-5" />
          {previewUrl ? 'Preview unavailable' : 'No image URL'}
        </span>
      )}

      {isSelected ? (
        <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      ) : null}
    </span>
  );

  return (
    <figure className="flex min-w-0 flex-col gap-1">
      {isSelectable && onToggle ? (
        <Button
          ariaLabel={`Select ${caption}`}
          aria-pressed={isSelected}
          className={`w-full rounded-md ${
            isSelected ? 'ring-2 ring-primary' : 'ring-1 ring-transparent'
          }`}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={onToggle}
        >
          {preview}
        </Button>
      ) : (
        preview
      )}

      <figcaption
        className="truncate text-2xs text-muted-foreground"
        title={previewUrl ?? caption}
      >
        <span className="font-medium text-foreground/80">{asset.role}</span>
        {caption === asset.role ? '' : ` · ${caption}`}
        {dimensions ? ` · ${dimensions}` : ''}
        {statusLabel ? ` · ${statusLabel}` : ''}
      </figcaption>
    </figure>
  );
}
