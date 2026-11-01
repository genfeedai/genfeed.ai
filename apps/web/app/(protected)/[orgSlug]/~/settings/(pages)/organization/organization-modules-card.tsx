'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  MemberRole,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  isOrganizationModuleOffered,
  ORGANIZATION_MODULE_IDS,
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
  organizationModuleOverridesSchema,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionSection from '@ui/collection/CollectionSection';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppCatalogThumbnail from '@/components/app-catalog/AppCatalogThumbnail';
import {
  APP_CATALOG,
  APP_CATALOG_CATEGORY_IDS,
} from '@/components/app-catalog/app-catalog';
import { APP_RAIL_REGISTRY } from '@/components/shell/app-rail/app-rail.registry';
import type { OrganizationModuleTileProps } from '@/features/settings/props/organization-modules-card.props';
import { useUserRole } from '@/hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@/hooks/data/organization/use-organization/use-organization';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';

/**
 * Settings → Modules: which apps the organization shows its members, laid
 * out on Apps' shelves. A switch only hides an app; work through the
 * API and MCP keeps running. Modules switched off for the platform or not
 * released to the organization are not listed (Admin → Flags owns both).
 */
export default function OrganizationModulesCard() {
  const translate = useTranslations('common.settings.organizationModules');
  const translateApps = useTranslations('common.apps');
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
      {!canManage ? (
        <Text as="p" color="muted" size="xs">
          {translate('adminOnly')}
        </Text>
      ) : null}

      {isLoading ? (
        <Text as="p" color="muted" role="status" size="xs">
          {translate('loading')}
        </Text>
      ) : !isAvailable ? (
        <div className="flex flex-col items-start gap-2">
          <Text as="p" color="muted" size="sm">
            {translate('unavailable')}
          </Text>
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
        APP_CATALOG_CATEGORY_IDS.map((categoryId) => {
          const moduleIds = offeredModuleIds.filter(
            (moduleId) => APP_CATALOG[moduleId].category === categoryId,
          );
          return (
            <CollectionSection
              key={categoryId}
              data-testid={`modules-category-${categoryId}`}
              description={translateApps(`categoryDescriptions.${categoryId}`)}
              itemCount={moduleIds.length}
              title={translateApps(`categories.${categoryId}`)}
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
                      isSubscriptionRequired={
                        isBillingEnabled === true &&
                        ORGANIZATION_MODULES[moduleId].requiresSubscription &&
                        settings?.hasPaidModuleSubscription === false
                      }
                      label={translate(`modules.${moduleId}.label`)}
                      moduleId={moduleId}
                      onShownChange={(isShown) => {
                        void changeModule(moduleId, isShown);
                      }}
                      subscriptionHref={
                        canManage
                          ? orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)
                          : undefined
                      }
                    />
                  );
                })}
              </CollectionGrid>
            </CollectionSection>
          );
        })
      )}

      {pending ? (
        <Text as="p" color="muted" role="status" size="xs">
          {translate('saving')}
        </Text>
      ) : null}
      {error ? (
        <Text as="p" color="destructive" role="alert" size="sm">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

function OrganizationModuleTile({
  description,
  icon,
  isDisabled,
  isPaid,
  isShown,
  isSubscriptionRequired,
  label,
  moduleId,
  onShownChange,
  subscriptionHref,
}: OrganizationModuleTileProps) {
  const translate = useTranslations('common.settings.organizationModules');

  return (
    <Card
      padding={CardPadding.NONE}
      gap={CardGap.NONE}
      bodyClassName="flex h-full flex-col"
      className="h-full"
      data-shown={isShown && !isSubscriptionRequired}
      data-testid={`module-card-${moduleId}`}
    >
      <AppCatalogThumbnail
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
        {isSubscriptionRequired ? (
          <div
            className="flex flex-col items-start gap-2"
            data-testid={`module-upsell-${moduleId}`}
          >
            <p className="text-xs text-muted-foreground">
              {translate('subscriptionRequired')}
            </p>
            {subscriptionHref ? (
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <Link href={subscriptionHref}>
                  {translate('subscriptionAction')}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <Switch
            aria-label={label}
            isChecked={isShown}
            isDisabled={isDisabled}
            label={translate(isShown ? 'shown' : 'hidden')}
            onCheckedChange={onShownChange}
          />
        )}
      </div>
    </Card>
  );
}
