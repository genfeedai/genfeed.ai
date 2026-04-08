'use client';

import { AssetScope, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailOverviewProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Image from 'next/image';
import Link from 'next/link';
import {
  HiArrowUpTray,
  HiDocumentDuplicate,
  HiPencil,
  HiShare,
  HiSparkles,
} from 'react-icons/hi2';

export default function BrandDetailOverview({
  brand,
  isGeneratingLogo,
  onUploadLogo,
  onGenerateLogo,
  onCopyPublicProfile,
  onEditBrand,
}: BrandDetailOverviewProps) {
  const profileUrl = `${EnvironmentService.apps.website}/u/${brand.slug}`;

  return (
    <div className="flex items-start gap-6">
      <div className="w-32 h-32 rounded-full overflow-hidden flex-shrink-0 relative group bg-background flex items-center justify-center">
        <Image
          src={
            brand.logoUrl
              ? brand.logoUrl
              : `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`
          }
          alt={`${brand.label} logo`}
          className="w-full h-full object-cover object-center"
          width={128}
          height={128}
          priority
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
          <div className="flex gap-2">
            <Button
              label={<HiArrowUpTray />}
              ariaLabel="Upload profile picture"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={onUploadLogo}
            />

            <Button
              label={<HiSparkles />}
              ariaLabel="Generate profile picture"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={onGenerateLogo}
              isLoading={isGeneratingLogo}
            />
          </div>
        </div>
      </div>
      <div className="flex-grow flex flex-col gap-2">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">{brand.label}</h1>
            <p className="text-muted-foreground">
              {brand.description || 'No description available'}
            </p>
          </div>

          <div className="flex gap-2">
            {brand.scope === AssetScope.PUBLIC && (
              <div className="flex">
                <Button
                  label={<HiDocumentDuplicate />}
                  variant={ButtonVariant.SECONDARY}
                  className=" border-r-0"
                  tooltip="Copy public profile link"
                  onClick={() => onCopyPublicProfile?.()}
                />

                <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
                  <Link
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <HiShare />
                    Profile
                  </Link>
                </PrimitiveButton>
              </div>
            )}

            <Button
              icon={<HiPencil />}
              tooltip="Edit brand"
              variant={ButtonVariant.SECONDARY}
              onClick={onEditBrand}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
