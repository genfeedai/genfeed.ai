'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { MemberRole } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  isOrganizationModuleOffered,
  ORGANIZATION_MODULE_IDS,
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
  organizationModuleOverridesSchema,
} from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import type { OrganizationModuleTileProps } from '@genfeedai/props/settings/organization-modules-card.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionSection from '@ui/collection/CollectionSection';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { APP_RAIL_REGISTRY } from '@ui/shell/app-rail/app-rail.registry';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExploreAppThumbnail from '@/components/explore/ExploreAppThumbnail';
import {
  EXPLORE_APP_CATALOG,
  STORE_CATEGORY_IDS,
} from '@/components/explore/explore-app-catalog';

/**
 * Settings → Modules: which apps the organization shows its members, laid
 * out on Explore's shelves. A switch only hides an app; work through the
 * API and MCP keeps running. Modules switched off for the platform or not
 * released to the organization are not listed (Admin → Flags owns both).
 */
export default function OrganizationModulesCard() {
  const translate = useTranslations('common.settings.organizationModules');
  const translateExplore = useTranslations('common.explore');
  const { organizationId } = useBrand();
  const { isLoading, refresh, settings } = useOrganization();
  const { flags } = useFeatureFlagContext();
  const role = useUserRole();
  const { orgHref } = useOrgUrl();
  const getService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );
  const isBillingEnabled = settings?.hasOrganizationBilling;
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
  const [pending, setPending] = useState<OrganizationModuleId | null>(null);
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

  const offeredModuleIds = useMemo(
    () =>
      ORGANIZATION_MODULE_IDS.filter((moduleId) =>
        isOrganizationModuleOffered(moduleId, settings, flags),
      ),
    [flags, settings],
  );

  async function changeModule(
    moduleId: OrganizationModuleId,
    isShown: boolean,
  ) {
    if (
      !canManage ||
      !parsed.success ||
      !isAvailable ||
      !organizationId ||
      operation.current
    )
      return;
    const organization = organizationId;
    const current = Symbol(moduleId);
    const isCurrent = () =>
      mounted.current &&
      scope.current === organization &&
      operation.current === current;
    operation.current = current;
    setPending(moduleId);
    setError(null);
    setNotice(null);
    let isSaved = false;
    try {
      const service = await getService();
      if (!isCurrent()) return;
      await service.patchSettings(organization, {
        moduleOverrides: { ...parsed.data, [moduleId]: isShown },
      });
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

  function isModuleShown(moduleId: OrganizationModuleId): boolean {
    if (!parsed.success || typeof isBillingEnabled !== 'boolean') return false;
    return (
      parsed.data[moduleId] ??
      (!isBillingEnabled || ORGANIZATION_MODULES[moduleId].isDefaultEnabled)
    );
  }

  return (
    <div className="flex flex-col gap-8" aria-busy={Boolean(pending)}>
      <div className="flex flex-col gap-1">
        <Heading size="md">{translate('title')}</Heading>
        <Text as="p" color="muted" size="sm">
          {translate('description')}
        </Text>
        {!canManage ? (
          <Text as="p" color="muted" size="xs">
            {translate('adminOnly')}
          </Text>
        ) : null}
      </div>

      {isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('loading')}
        </p>
      ) : !isAvailable ? (
        <div className="flex flex-col items-start gap-2">
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
      ) : (
        STORE_CATEGORY_IDS.map((categoryId) => {
          const moduleIds = offeredModuleIds.filter(
            (moduleId) => EXPLORE_APP_CATALOG[moduleId].category === categoryId,
          );
          return (
            <CollectionSection
              key={categoryId}
              data-testid={`modules-category-${categoryId}`}
              description={translateExplore(
                `categoryDescriptions.${categoryId}`,
              )}
              itemCount={moduleIds.length}
              title={translateExplore(`categories.${categoryId}`)}
            >
              <CollectionGrid>
                {moduleIds.map((moduleId) => {
                  const railApp = APP_RAIL_REGISTRY.find(
                    (app) => app.id === moduleId,
                  );
                  if (!railApp) return null;
                  return (
                    <OrganizationModuleTile
                      key={moduleId}
                      description={translate(`modules.${moduleId}.description`)}
                      icon={railApp.icon}
                      isDisabled={!canManage || Boolean(pending)}
                      isPaid={
                        isBillingEnabled === true &&
                        ORGANIZATION_MODULES[moduleId].requiresSubscription
                      }
                      isShown={isModuleShown(moduleId)}
                      label={translate(`modules.${moduleId}.label`)}
                      moduleId={moduleId}
                      onShownChange={(isShown) => {
                        void changeModule(moduleId, isShown);
                      }}
                    />
                  );
                })}
              </CollectionGrid>
            </CollectionSection>
          );
        })
      )}

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

      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">{translate('dataHelp')}</p>
        {isBillingEnabled ? (
          <>
            <p className="text-xs text-muted-foreground">
              {translate('paidHelp')}
            </p>
            <Link
              className="text-sm underline underline-offset-4"
              href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
            >
              {translate('subscription')}
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

function OrganizationModuleTile({
  description,
  icon,
  isDisabled,
  isPaid,
  isShown,
  label,
  moduleId,
  onShownChange,
}: OrganizationModuleTileProps) {
  const translate = useTranslations('common.settings.organizationModules');

  return (
    <Card
      bodyClassName="flex h-full flex-col gap-0 p-0"
      className="h-full"
      data-shown={isShown}
      data-testid={`module-card-${moduleId}`}
    >
      <ExploreAppThumbnail
        appId={moduleId}
        icon={icon}
        label={label}
        size="standard"
      />
      <div className="flex flex-1 flex-col justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {label}
            </h3>
            {isPaid ? (
              <Badge className="shrink-0">{translate('paidPlan')}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch
          aria-label={label}
          isChecked={isShown}
          isDisabled={isDisabled}
          label={translate(isShown ? 'shown' : 'hidden')}
          onCheckedChange={onShownChange}
        />
      </div>
    </Card>
  );
}
