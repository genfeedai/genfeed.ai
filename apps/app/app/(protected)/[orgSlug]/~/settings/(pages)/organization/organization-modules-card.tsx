'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  isOrganizationModuleUnreleased,
  ORGANIZATION_MODULE_IDS,
  ORGANIZATION_MODULES,
  organizationModuleOverridesSchema,
  type ToggleableOrganizationModuleId,
} from '@genfeedai/contracts/constants';
import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function OrganizationModulesCard() {
  const translate = useTranslations('common.settings.organizationModules');
  const { organizationId } = useBrand();
  const { isLoading, refresh, settings } = useOrganization();
  const role = useUserRole();
  const { orgHref } = useOrgUrl();
  const getService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );
  const isBillingEnabled = settings?.hasOrganizationBilling;
  const isReleasePreviewEnabled = settings?.isReleasePreviewEnabled === true;
  const { isSuperAdmin } = useAccessState();
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const parsed = organizationModuleOverridesSchema.safeParse(
    settings?.moduleOverrides,
  );
  const isAvailable = Boolean(
    organizationId &&
      settings &&
      parsed.success &&
      typeof isBillingEnabled === 'boolean' &&
      !isLoading,
  );
  const [pending, setPending] = useState<
    ToggleableOrganizationModuleId | 'releasePreview' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scope = useRef(organizationId);
  const operation = useRef<symbol | null>(null);
  const mounted = useRef(true);
  scope.current = organizationId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    scope.current = organizationId;
    operation.current = null;
    setPending(null);
    setError(null);
    setNotice(null);
  }, [organizationId]);

  function changeModule(
    moduleId: ToggleableOrganizationModuleId,
    isEnabled: boolean,
  ) {
    if (!canManage || !parsed.success) return;
    return saveSettings(moduleId, {
      moduleOverrides: { ...parsed.data, [moduleId]: isEnabled },
    });
  }

  /** #5502 only platform admins move an organization onto release preview. */
  function changeReleasePreview(isEnabled: boolean) {
    if (!isSuperAdmin) return;
    return saveSettings('releasePreview', {
      isReleasePreviewEnabled: isEnabled,
    });
  }

  async function saveSettings(
    pendingKey: ToggleableOrganizationModuleId | 'releasePreview',
    patch: Partial<IOrganizationSetting>,
  ) {
    if (!isAvailable || !organizationId || operation.current) return;
    const organization = organizationId;
    const current = Symbol(pendingKey);
    const isCurrent = () =>
      mounted.current &&
      scope.current === organization &&
      operation.current === current;
    operation.current = current;
    setPending(pendingKey);
    setError(null);
    setNotice(null);
    let isSaved = false;
    try {
      const service = await getService();
      if (!isCurrent()) return;
      await service.patchSettings(organization, patch);
      isSaved = true;
      clearClientProtectedBootstrapCache();
      if (!isCurrent()) return;
      await refresh();
      if (isCurrent()) setNotice(translate('saved'));
    } catch (failure: unknown) {
      logger.error('Failed to update organization module settings', failure);
      if (isCurrent())
        setError(translate(isSaved ? 'savedRefreshFailed' : 'saveFailed'));
    } finally {
      if (isCurrent()) {
        operation.current = null;
        setPending(null);
      }
    }
  }

  async function retry() {
    if (!organizationId || isLoading) return;
    const organization = organizationId;
    setError(null);
    try {
      await refresh();
    } catch (failure: unknown) {
      logger.error('Failed to reload organization module settings', failure);
      if (mounted.current && scope.current === organization)
        setError(translate('loadFailed'));
    }
  }

  return (
    <Card
      label={translate('title')}
      description={translate('description')}
      bodyClassName="gap-3 p-4"
    >
      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          {translate('adminOnly')}
        </p>
      ) : null}
      <div aria-busy={Boolean(pending)} className="divide-y divide-border">
        {ORGANIZATION_MODULE_IDS.map((moduleId) => {
          const module = ORGANIZATION_MODULES[moduleId];
          const label = translate(`modules.${moduleId}.label`);
          const description = translate(`modules.${moduleId}.description`);
          const toggleable = moduleId as ToggleableOrganizationModuleId;
          const isUnreleased = isOrganizationModuleUnreleased(
            moduleId,
            isBillingEnabled === true,
            isReleasePreviewEnabled,
          );
          const isEnabled =
            !isUnreleased &&
            (!module.isToggleable ||
              (parsed.success &&
                typeof isBillingEnabled === 'boolean' &&
                (parsed.data[toggleable] ??
                  (!isBillingEnabled || module.isDefaultEnabled))));
          return (
            <div className="py-3 first:pt-0 last:pb-0" key={moduleId}>
              {module.isToggleable ? (
                <Switch
                  aria-label={label}
                  description={description}
                  isChecked={Boolean(isEnabled)}
                  isDisabled={
                    !canManage ||
                    !isAvailable ||
                    isUnreleased ||
                    Boolean(pending)
                  }
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {label}
                      {isUnreleased ? (
                        <Badge>{translate('notReleased')}</Badge>
                      ) : isBillingEnabled && module.requiresSubscription ? (
                        <Badge>{translate('paidPlan')}</Badge>
                      ) : null}
                    </span>
                  }
                  onCheckedChange={(enabled) => {
                    void changeModule(toggleable, enabled);
                  }}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <Badge className="shrink-0">{translate('alwaysOn')}</Badge>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('loading')}
        </p>
      ) : !isAvailable ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {translate('unavailable')}
          </p>
          <Button
            isDisabled={!organizationId || isLoading}
            onClick={() => {
              void retry();
            }}
            type="button"
          >
            {translate('retry')}
          </Button>
        </div>
      ) : null}
      {pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('saving')}
        </p>
      ) : null}
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
      {isSuperAdmin && isBillingEnabled ? (
        <div className="border-t border-border pt-3">
          <Switch
            aria-label={translate('releasePreview.label')}
            description={translate('releasePreview.description')}
            isChecked={isReleasePreviewEnabled}
            isDisabled={!isAvailable || Boolean(pending)}
            label={translate('releasePreview.label')}
            onCheckedChange={(enabled) => {
              void changeReleasePreview(enabled);
            }}
          />
        </div>
      ) : null}
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        {translate('dataHelp')}
      </p>
      {isBillingEnabled ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {translate('paidHelp')}
          </p>
          <Link
            className="text-sm underline underline-offset-4"
            href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
          >
            {translate('subscription')}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
