'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { BRAND_HANDLE_MAX_LENGTH } from '@genfeedai/contracts/constants';
import { isPublicAssetScope } from '@genfeedai/helpers';
import type { BrandDetailOverviewProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import { Copy, Share2, Sparkles, Upload } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';

export default function BrandDetailOverview({
  brand,
  isGeneratingLogo,
  onUploadLogo,
  onGenerateLogo,
  onUpdateBrand,
  onUpdateHandle,
  onCopyPublicProfile,
}: BrandDetailOverviewProps) {
  const t = useTranslations('pages.brandDetailOverview');
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
        <div
          className={
            'absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100' /* design-system-allow-content-color */
          }
        >
          <div className="flex gap-1.5">
            <Button
              icon={<Upload className="size-3.5" />}
              ariaLabel={t('uploadProfilePicture')}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.ICON}
              className={ICON_BUTTON_CLASS}
              onClick={onUploadLogo}
            />
            <Button
              icon={<Sparkles className="size-3.5" />}
              ariaLabel={t('generateProfilePicture')}
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
            <EditableText
              ariaLabel={t('editBrandName')}
              className="mb-1"
              displayClassName="text-2xl font-bold"
              isRequired
              onSave={(value) => onUpdateBrand('label', value)}
              value={brand.label}
            />
            {brand.slug && onUpdateHandle ? (
              // The leading `@` is display only; the save normalizes it away.
              <EditableText
                ariaLabel={t('editBrandHandle')}
                className="mb-1"
                displayClassName="text-xs text-muted-foreground"
                isRequired
                maxLength={BRAND_HANDLE_MAX_LENGTH + 1}
                onSave={onUpdateHandle}
                value={`@${brand.slug}`}
              />
            ) : brand.slug ? (
              <p className="mb-1 text-xs text-muted-foreground">
                @{brand.slug}
              </p>
            ) : null}
            <EditableText
              ariaLabel={t('editBrandDescription')}
              displayClassName="text-muted-foreground"
              isMultiline
              onSave={(value) => onUpdateBrand('description', value)}
              placeholder={t('addDescription')}
              value={brand.description}
            />
          </div>

          {isPublicAssetScope(brand.scope) && onCopyPublicProfile ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                icon={<Copy className="size-3.5" />}
                ariaLabel={t('copyPublicProfileLink')}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.ICON}
                className={ICON_BUTTON_CLASS}
                tooltip={t('copyPublicProfileLink')}
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
                  {t('profile')}
                </Link>
              </PrimitiveButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
