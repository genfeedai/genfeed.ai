'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailBannerProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import Image from 'next/image';
import { HiArrowUpTray, HiSparkles } from 'react-icons/hi2';

export default function BrandDetailBanner({
  brand,
  isGeneratingBanner,
  onUploadBanner,
  onGenerateBanner,
}: BrandDetailBannerProps) {
  return (
    <div className="relative h-48 bg-muted mb-8 group">
      <Image
        src={
          brand.bannerUrl
            ? brand.bannerUrl
            : `${EnvironmentService.assetsEndpoint}/placeholders/landscape.jpg`
        }
        alt={`${brand.label} banner`}
        className="w-full h-full object-cover object-center"
        width={1500}
        height={500}
        priority
      />

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
        <div className="absolute top-2 right-2 flex gap-2">
          <Button
            label={<HiArrowUpTray />}
            ariaLabel="Upload banner"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.XS}
            onClick={onUploadBanner}
          />

          <Button
            label={<HiSparkles />}
            ariaLabel="Generate banner"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
            onClick={onGenerateBanner}
            isLoading={isGeneratingBanner}
          />
        </div>
      </div>
    </div>
  );
}
