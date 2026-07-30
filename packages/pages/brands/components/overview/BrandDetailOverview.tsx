'use client';

import { AssetScope, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailOverviewProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { Copy, Share2, Sparkles, Upload } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';

export default function BrandDetailOverview({
  brand,
  isGeneratingLogo,
  onUploadLogo,
  onGenerateLogo,
  onCopyPublicProfile,
}: BrandDetailOverviewProps) {
  const profileUrl = `${EnvironmentService.apps.website}/u/${brand.slug}`;

  return (
    <div className="flex items-start gap-6">
      <div className="group relative flex size-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
        <Image
          src={
            brand.logoUrl
              ? brand.logoUrl
              : `${EnvironmentService.assetsEndpoint}/placeholders/square.jpg`
          }
          alt={`${brand.label} logo`}
          className="size-full object-cover object-center"
          width={128}
          height={128}
          priority
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex gap-1.5">
            <Button
              icon={<Upload className="size-3.5" />}
              ariaLabel="Upload profile picture"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.ICON}
              className={ICON_BUTTON_CLASS}
              onClick={onUploadLogo}
            />
            <Button
              icon={<Sparkles className="size-3.5" />}
              ariaLabel="Generate profile picture"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.ICON}
              className={ICON_BUTTON_CLASS}
              onClick={onGenerateLogo}
              isLoading={isGeneratingLogo}
            />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="mb-1 text-2xl font-bold">{brand.label}</h2>
            {brand.slug ? (
              <p className="mb-1 text-xs text-muted-foreground">@{brand.slug}</p>
            ) : null}
            <p className="text-muted-foreground">
              {brand.description || 'No description available'}
            </p>
          </div>

          {typeof brand.scope === 'string' &&
          brand.scope.toLowerCase() === AssetScope.PUBLIC &&
          onCopyPublicProfile ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                icon={<Copy className="size-3.5" />}
                ariaLabel="Copy public profile link"
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.ICON}
                className={ICON_BUTTON_CLASS}
                tooltip="Copy public profile link"
                onClick={() => onCopyPublicProfile()}
              />
              <PrimitiveButton
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
              >
                <Link
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs [&_svg]:size-3.5"
                >
                  <Share2 className="size-3.5" />
                  Profile
                </Link>
              </PrimitiveButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
