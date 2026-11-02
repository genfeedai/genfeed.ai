'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { BrandDetailBannerProps } from '@props/pages/brand-detail.props';
import { BrandBanner } from '@ui/primitives/brand-banner';
import { Button } from '@ui/primitives/button';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Sparkles, Upload } from 'lucide-react';

const ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';

export default function BrandDetailBanner({
  brand,
  isGeneratingBanner,
  onUploadBanner,
  onGenerateBanner,
}: BrandDetailBannerProps) {
  return (
    <BrandBanner
      alt={`${brand.label} banner`}
      className="mb-8"
      isPriority
      src={brand.bannerUrl}
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity' /* design-system-allow-content-color */,
          hoverRevealClassName(),
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
