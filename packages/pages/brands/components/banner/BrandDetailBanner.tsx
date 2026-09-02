'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailBannerProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Sparkles, Upload } from 'lucide-react';
import Image from 'next/image';

const ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';

export default function BrandDetailBanner({
  brand,
  isGeneratingBanner,
  onUploadBanner,
  onGenerateBanner,
}: BrandDetailBannerProps) {
  return (
    <div className="group relative mb-8 h-48 bg-muted">
      <Image
        src={
          brand.bannerUrl
            ? brand.bannerUrl
            : `${EnvironmentService.assetsEndpoint}/placeholders/landscape.jpg`
        }
        alt={`${brand.label} banner`}
        className="size-full object-cover object-center"
        width={1500}
        height={500}
        priority
      />

      <div
        className={
          'absolute inset-0 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100' /* design-system-allow-content-color */
        }
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
    </div>
  );
}
