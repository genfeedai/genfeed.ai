'use client';

import type { BrandVideoTabProps } from '@/features/brands/props/brand-video-kit.props';
import BrandVideoFinishingEditor from './BrandVideoFinishingEditor';
import BrandVideoIdentityEditor from './BrandVideoIdentityEditor';
import { finishingFromBrand } from './brand-video-kit.helpers';

/** The Video tab's editors: how the brand moves on screen, and what finishes a video. */
export default function BrandVideoTab({
  brand,
  brandId,
  content,
  isDisabled,
  onVideoChange,
  onFinishingChange,
  onRefreshBrand,
}: BrandVideoTabProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BrandVideoIdentityEditor
        video={content?.video}
        isDisabled={isDisabled}
        onChange={onVideoChange}
      />
      <BrandVideoFinishingEditor
        brand={brand}
        brandId={brandId}
        finishing={content?.finishing ?? finishingFromBrand(brand)}
        isDisabled={isDisabled}
        onChange={onFinishingChange}
        onRefreshBrand={onRefreshBrand}
      />
    </div>
  );
}
