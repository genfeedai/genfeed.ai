'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { AssetCategory, ButtonVariant } from '@genfeedai/contracts';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import type { OrganizationIdentityCardProps } from '@props/settings/organization-identity-card.props';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Upload } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/** Organization name, handle and logo — the logo also drives the org switcher. */
export default function OrganizationIdentityCard({
  organizationId,
}: OrganizationIdentityCardProps) {
  const translate = useTranslations('common.settings.organizationIdentity');
  const { organizations, refreshOrganizations } = useRoutedOrganization();
  const { openUpload } = useUploadModal();
  const organization = organizations.find((org) => org.id === organizationId);
  const label = organization?.label ?? translate('title');
  const logoUrl = organization?.logoUrl ?? null;

  const handleUploadLogo = useCallback(() => {
    if (!organizationId) {
      return;
    }

    openUpload({
      category: AssetCategory.LOGO,
      onComplete: () => {
        refreshOrganizations().catch((error: unknown) => {
          logger.error(
            'Failed to refresh organizations after logo upload',
            error,
          );
        });
      },
      parentId: organizationId,
      parentModel: 'Organization',
    });
  }, [openUpload, organizationId, refreshOrganizations]);

  return (
    <Card label={translate('title')} bodyClassName="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-2xl font-semibold text-foreground">
            {logoUrl ? (
              <Image
                alt={translate('logoAlt', { label })}
                className="size-full object-cover"
                height={64}
                sizes="64px"
                src={logoUrl}
                unoptimized={!canOptimizeImageSource(logoUrl)}
                width={64}
              />
            ) : (
              label.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
              {label}
            </p>
            {organization?.slug ? (
              <p className="truncate text-sm text-muted-foreground">
                @{organization.slug}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {translate('logoHint')}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0"
          icon={<Upload className="size-3.5" />}
          isDisabled={!organizationId}
          label={translate(logoUrl ? 'replaceLogo' : 'uploadLogo')}
          onClick={handleUploadLogo}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </Card>
  );
}
