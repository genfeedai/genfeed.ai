'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  BRAND_LOGO_DOWNLOAD_SIZES,
  type BrandLogoDownloadFormat,
} from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BrandLogoDownloadMenuProps } from '@/features/brands/props/brand-kit-slots.props';

const RASTER_FORMATS: readonly Exclude<BrandLogoDownloadFormat, 'svg'>[] = [
  'png',
  'webp',
];

/**
 * Download one logo variant (#9706): PNG or WEBP at a chosen longest side, or
 * the SVG itself when the logo was uploaded as one.
 */
export default function BrandLogoDownloadMenu({
  label,
  hasVector,
  isDisabled = false,
  onDownload,
}: BrandLogoDownloadMenuProps) {
  const t = useTranslations('pages.brandKitSettings.slots');
  const formatLabels: Record<
    Exclude<BrandLogoDownloadFormat, 'svg'>,
    string
  > = { png: t('downloadPng'), webp: t('downloadWebp') };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          ariaLabel={`${t('download')} ${label}`}
          isDisabled={isDisabled}
        >
          <Download className="size-3.5" />
          {t('download')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {hasVector ? (
          <>
            <DropdownMenuItem onSelect={() => onDownload('svg', 0)}>
              {t('downloadVector')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {RASTER_FORMATS.map((format, index) => (
          <DropdownMenuGroup key={format}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{formatLabels[format]}</DropdownMenuLabel>
            {BRAND_LOGO_DOWNLOAD_SIZES.map((size) => (
              <DropdownMenuItem
                key={size}
                onSelect={() => onDownload(format, size)}
              >
                {t('downloadSize', { format: formatLabels[format], size })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
