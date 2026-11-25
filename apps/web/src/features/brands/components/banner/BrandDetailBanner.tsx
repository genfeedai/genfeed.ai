'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { BrandDetailBannerProps } from '@props/pages/brand-detail.props';
import { BrandBanner } from '@ui/primitives/brand-banner';
import { Button } from '@ui/primitives/button';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Sparkles, Upload } from 'lucide-react';

const ICON_BUTTON_CLASS = 'shrink-0 [&_svg]:size-3.5';

export default function BrandDetailBanner({
  brand,
  isGeneratingBanner,
  onUploadBanner,
  onGenerateBanner,
}: BrandDetailBannerProps) {
  const hasBanner = Boolean(brand.bannerUrl);

  return (
    <BrandBanner
      alt={`${brand.label} banner`}
      className={cn(!hasBanner && 'bg-linear-to-br from-tertiary to-muted')}
      isPriority
      shape="rounded"
      src={brand.bannerUrl}
    >
      <div
        className={cn(
          'absolute inset-0 transition-opacity',
          // The dim layer and hover reveal are for a picture. An empty banner
          // shows its two actions at rest: they are what fills it.
          hasBanner && 'bg-black/50' /* design-system-allow-content-color */,
          hasBanner && hoverRevealClassName(),
        )}
      >
        <div className="absolute top-2 right-2 flex gap-1.5">
          <Button
            icon={<Upload className="size-3.5" />}
            ariaLabel="Upload banner"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.ICON}
            className={ICON_BUTTON_CLASS}
            onClick={onUploadBanner}
          />
          <Button
            icon={<Sparkles className="size-3.5" />}
            ariaLabel="Generate banner"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.ICON}
            className={ICON_BUTTON_CLASS}
            onClick={onGenerateBanner}
            isLoading={isGeneratingBanner}
          />
        </div>
      </div>
    </BrandBanner>
  );
}
