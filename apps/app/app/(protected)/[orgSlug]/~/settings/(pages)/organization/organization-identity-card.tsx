'use client';

import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { AssetCategory, ButtonVariant } from '@genfeedai/contracts';
import { getOrgSwitchHref } from '@genfeedai/contracts/constants';
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
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Upload } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

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
      {organization ? (
        <OrganizationIdentityEditor
          key={organization.id}
          organization={organization}
          refreshOrganizations={refreshOrganizations}
        />
      ) : null}
    </Card>
  );
}

function OrganizationIdentityEditor({
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
  const [name, setName] = useState(organization.label);
  const [handle, setHandle] = useState(organization.slug);
  const [isSaving, setIsSaving] = useState(false);
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
  const label = name.trim();
  const slug = handle.trim();
  const isDirty = label !== saved.label || slug !== saved.slug;
  const nameError = label ? undefined : translate('nameRequired');
  const handleError = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/.test(slug)
    ? undefined
    : translate('handleInvalid');

  const save = async () => {
    if (!canEdit || saving.current || !isDirty || nameError || handleError)
      return;
    saving.current = true;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const service = await getOrganizationsService();
      if (!mounted.current) return;
      const updated = await service.patch(organization.id, { label, slug });
      clearClientProtectedBootstrapCache();
      if (!mounted.current) return;
      setSaved({ label: updated.label, slug: updated.slug });
      setName(updated.label);
      setHandle(updated.slug);
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
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  return (
    <Form
      className="mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={translate('name')}
          htmlFor="organization-name"
          error={nameError}
        >
          <Input
            value={name}
            isReadOnly={!canEdit}
            isDisabled={isSaving}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
              setNotice(null);
            }}
          />
        </Field>
        <Field
          label={translate('handle')}
          htmlFor="organization-handle"
          helpText={translate('handleHint')}
          error={handleError}
        >
          <Input
            value={handle}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            isReadOnly={!canEdit}
            isDisabled={isSaving}
            onChange={(event) => {
              setHandle(event.target.value);
              setError(null);
              setNotice(null);
            }}
          />
        </Field>
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
      {canEdit ? (
        <div className="flex gap-2">
          <Button
            type="submit"
            label={translate('save')}
            isLoading={isSaving}
            isDisabled={!isDirty || !!nameError || !!handleError}
          />
          {isDirty ? (
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              label={translate('cancel')}
              isDisabled={isSaving}
              onClick={() => {
                setName(saved.label);
                setHandle(saved.slug);
                setError(null);
                setNotice(null);
              }}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('ownerOnly')}
        </p>
      )}
    </Form>
  );
}
