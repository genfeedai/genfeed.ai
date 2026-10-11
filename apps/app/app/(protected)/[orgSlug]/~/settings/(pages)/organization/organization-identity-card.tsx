'use client';

import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { AssetCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  getOrgSwitchHref,
  normalizeBrandHandle,
} from '@genfeedai/contracts/constants';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  OrganizationIdentityCardProps,
  OrganizationIdentityEditorProps,
} from '@props/settings/organization-identity-card.props';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import { Sparkles, Upload } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

const ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/;
// Two more than the 48-character handle limit: the display-only `@` prefix.
const HANDLE_INPUT_MAX_LENGTH = 49;

/** Organization name, handle and logo — the logo also drives the org switcher. */
export default function OrganizationIdentityCard({
  organizationId,
}: OrganizationIdentityCardProps) {
  const translate = useTranslations('common.settings.organizationIdentity');
  const { organizations, refreshOrganizations } = useRoutedOrganization();
  const { openUpload } = useUploadModal();
  const getOrganizationsService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const isGeneratingRef = useRef(false);
  const mounted = useRef(true);
  const organization = organizations.find((org) => org.id === organizationId);
  const logoUrl = organization?.logoUrl ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  const handleGenerateLogo = useCallback(async () => {
    if (!organizationId || isGeneratingRef.current) {
      return;
    }

    isGeneratingRef.current = true;
    setIsGeneratingLogo(true);
    setGenerateError(null);
    try {
      const service = await getOrganizationsService();
      await service.generateLogo(organizationId);
      await refreshOrganizations();
    } catch (error) {
      logger.error('Failed to generate organization logo', error);
      if (mounted.current) {
        setGenerateError(
          getJsonApiErrorMessage(error, translate('generateLogoFailed')),
        );
      }
    } finally {
      isGeneratingRef.current = false;
      if (mounted.current) {
        setIsGeneratingLogo(false);
      }
    }
  }, [
    getOrganizationsService,
    organizationId,
    refreshOrganizations,
    translate,
  ]);

  return (
    <Card label={translate('title')} bodyClassName="p-4">
      {organization ? (
        <OrganizationIdentityEditor
          key={organization.id}
          isGeneratingLogo={isGeneratingLogo}
          logoUrl={logoUrl}
          onGenerateLogo={() => {
            void handleGenerateLogo();
          }}
          onUploadLogo={handleUploadLogo}
          organization={organization}
          refreshOrganizations={refreshOrganizations}
        />
      ) : null}
      {generateError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {generateError}
        </p>
      ) : null}
    </Card>
  );
}

function OrganizationIdentityEditor({
  isGeneratingLogo,
  logoUrl,
  onGenerateLogo,
  onUploadLogo,
  organization,
  refreshOrganizations,
}: OrganizationIdentityEditorProps) {
  const translate = useTranslations('common.settings.organizationIdentity');
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const getOrganizationsService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );
  const [saved, setSaved] = useState({
    label: organization.label,
    slug: organization.slug,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The existing organization PATCH authorizes the scalar owner, not every member.
  const canEdit = organization.isOwner === true;

  // EditableText reverts its draft when this throws, so every rejected save
  // surfaces its message here and rethrows.
  const save = async (next: { label: string; slug: string }) => {
    if (!canEdit || saving.current) return;
    if (next.label === saved.label && next.slug === saved.slug) return;
    saving.current = true;
    setError(null);
    setNotice(null);
    try {
      const service = await getOrganizationsService();
      if (!mounted.current) return;
      const updated = await service.patch(organization.id, next);
      clearClientProtectedBootstrapCache();
      if (!mounted.current) return;
      setSaved({ label: updated.label, slug: updated.slug });
      setNotice(translate('saved'));
      if (updated.slug !== organization.slug) {
        // Route reconciliation reloads the list and confirms the same org ID at its new handle.
        router.replace(getOrgSwitchHref(updated.slug, pathname));
      } else {
        try {
          await refreshOrganizations();
        } catch (refreshError) {
          logger.error(
            'Failed to refresh organization after identity update',
            refreshError,
          );
          if (mounted.current) setNotice(translate('savedRefreshFailed'));
        }
      }
    } catch (saveError) {
      logger.error('Failed to update organization identity', saveError);
      if (mounted.current)
        setError(getJsonApiErrorMessage(saveError, translate('saveFailed')));
      throw saveError;
    } finally {
      saving.current = false;
    }
  };

  const handleSaveName = async (value: string) => {
    const label = value.trim();
    if (!label) {
      setError(translate('nameRequired'));
      throw new Error(translate('nameRequired'));
    }
    await save({ label, slug: saved.slug });
  };

  const handleSaveHandle = async (value: string) => {
    // The leading `@` is display only; it is normalized away before saving.
    const slug = normalizeBrandHandle(value);
    if (!HANDLE_PATTERN.test(slug)) {
      setError(translate('handleInvalid'));
      throw new Error(translate('handleInvalid'));
    }
    await save({ label: saved.label, slug });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-6">
        <div className="group relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-3xl font-semibold text-foreground">
          {logoUrl ? (
            <Image
              alt={translate('logoAlt', { label: saved.label })}
              className="size-full object-cover object-center"
              height={96}
              sizes="96px"
              src={logoUrl}
              unoptimized={!canOptimizeImageSource(logoUrl)}
              width={96}
            />
          ) : (
            saved.label.charAt(0).toUpperCase()
          )}
          <div
            className={
              'absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100' /* design-system-allow-content-color */
            }
          >
            <div className="flex gap-1.5">
              <Button
                ariaLabel={translate('uploadLogo')}
                className={ICON_BUTTON_CLASS}
                icon={<Upload className="size-3.5" />}
                isDisabled={isGeneratingLogo}
                onClick={onUploadLogo}
                size={ButtonSize.ICON}
                variant={ButtonVariant.DEFAULT}
              />
              <Button
                ariaLabel={translate('generateLogo')}
                className={ICON_BUTTON_CLASS}
                icon={<Sparkles className="size-3.5" />}
                isDisabled={!canEdit}
                isLoading={isGeneratingLogo}
                onClick={onGenerateLogo}
                size={ButtonSize.ICON}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <EditableText
            ariaLabel={translate('editName')}
            displayClassName="text-2xl font-bold"
            isDisabled={!canEdit}
            isRequired
            onSave={handleSaveName}
            value={saved.label}
          />
          <EditableText
            ariaLabel={translate('editHandle')}
            displayClassName="text-sm text-muted-foreground"
            isDisabled={!canEdit}
            isRequired
            maxLength={HANDLE_INPUT_MAX_LENGTH}
            onSave={handleSaveHandle}
            value={`@${saved.slug}`}
          />
          <p className="px-1 text-xs text-muted-foreground">
            {translate('handleHint')}
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {canEdit ? null : (
        <p className="text-sm text-muted-foreground">
          {translate('ownerOnly')}
        </p>
      )}
    </div>
  );
}
