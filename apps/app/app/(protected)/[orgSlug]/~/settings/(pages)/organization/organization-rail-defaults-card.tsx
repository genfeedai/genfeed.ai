'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { clearClientProtectedBootstrapCache } from '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { ButtonSize, ButtonVariant, MemberRole } from '@genfeedai/contracts';
import {
  applyRailAppOrder,
  isOrganizationModuleOffered,
  normalizeRailAppOrder,
} from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { moveRailAppBy } from '@ui/shell/app-rail/app-rail.order';
import { APP_RAIL_REGISTRY } from '@ui/shell/app-rail/app-rail.registry';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

const DEFAULT_HOME_VALUE = 'default';

/**
 * Settings → Modules: the rail order and home app new members start from.
 * A member's own choice wins; this only sets what they see before they
 * choose. Only owners and admins can change it.
 */
export default function OrganizationRailDefaultsCard() {
  const translate = useTranslations('common.settings.organizationRailDefaults');
  const translateRail = useTranslations('common.appRail');
  const { organizationId } = useBrand();
  const { isLoading, refresh, settings } = useOrganization();
  const { flags } = useFeatureFlagContext();
  const role = useUserRole();
  const getService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;

  // The apps the organization offers; a hidden module is not worth choosing.
  const offeredApps = useMemo(
    () =>
      APP_RAIL_REGISTRY.filter(
        (app) =>
          !app.organizationModule ||
          isOrganizationModuleOffered(app.organizationModule, settings, flags),
      ),
    [flags, settings],
  );
  const savedOrder = normalizeRailAppOrder(settings?.defaultRailOrder);
  const orderedApps = useMemo(
    () => applyRailAppOrder(offeredApps, savedOrder),
    [offeredApps, savedOrder],
  );
  const orderedIds = orderedApps.map((app) => app.id);
  const savedHomeAppId = offeredApps.some(
    (app) => app.id === settings?.defaultHomeAppId,
  )
    ? (settings?.defaultHomeAppId ?? DEFAULT_HOME_VALUE)
    : DEFAULT_HOME_VALUE;
  const workspaceLabel = translateRail('workspace.label');

  const save = useCallback(
    async (patch: {
      defaultHomeAppId?: string | null;
      defaultRailOrder?: readonly string[];
    }) => {
      if (!canManage || !organizationId || isSaving) return;
      setIsSaving(true);
      setError(null);
      setNotice(null);
      let isSaved = false;
      try {
        const service = await getService();
        const { defaultRailOrder, ...rest } = patch;
        await service.patchSettings(organizationId, {
          ...rest,
          ...(defaultRailOrder
            ? { defaultRailOrder: [...defaultRailOrder] }
            : {}),
        });
        isSaved = true;
        clearClientProtectedBootstrapCache();
        await refresh();
        setNotice(translate('saved'));
      } catch (failure: unknown) {
        logger.error('Failed to update organization rail defaults', failure);
        setError(translate(isSaved ? 'savedRefreshFailed' : 'saveFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [canManage, getService, isSaving, organizationId, refresh, translate],
  );

  if (!canManage) return null;

  return (
    <Card
      bodyClassName="flex flex-col gap-6 p-4"
      data-testid="organization-rail-defaults"
      description={translate('description')}
      label={translate('title')}
    >
      {isLoading || !settings ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('loading')}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium">{translate('homeTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {translate('homeDescription')}
              </p>
            </div>
            <Select
              disabled={isSaving}
              onValueChange={(value) => {
                void save({
                  defaultHomeAppId: value === DEFAULT_HOME_VALUE ? null : value,
                });
              }}
              value={savedHomeAppId}
            >
              <SelectTrigger
                aria-label={translate('homeTitle')}
                data-testid="organization-home-app-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_HOME_VALUE}>
                  {translate('homeDefault', { app: workspaceLabel })}
                </SelectItem>
                {offeredApps.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {translateRail(app.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium">{translate('orderTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {translate('orderDescription')}
              </p>
            </div>
            <ul className="flex flex-col gap-1">
              {orderedApps.map((app, index) => {
                const Icon = app.icon;
                const label = translateRail(app.label);
                return (
                  <li
                    className="flex items-center gap-2 rounded-lg px-2 py-1"
                    data-testid={`organization-rail-order-${app.id}`}
                    key={app.id}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-4 text-foreground/60"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {label}
                    </span>
                    <Button
                      ariaLabel={translate('moveUp', { app: label })}
                      isDisabled={isSaving || index === 0}
                      onClick={() => {
                        void save({
                          defaultRailOrder: moveRailAppBy(
                            orderedIds,
                            app.id,
                            -1,
                          ),
                        });
                      }}
                      size={ButtonSize.ICON}
                      type="button"
                      variant={ButtonVariant.GHOST}
                      withWrapper={false}
                    >
                      <ArrowUp aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      ariaLabel={translate('moveDown', { app: label })}
                      isDisabled={isSaving || index === orderedApps.length - 1}
                      onClick={() => {
                        void save({
                          defaultRailOrder: moveRailAppBy(
                            orderedIds,
                            app.id,
                            1,
                          ),
                        });
                      }}
                      size={ButtonSize.ICON}
                      type="button"
                      variant={ButtonVariant.GHOST}
                      withWrapper={false}
                    >
                      <ArrowDown aria-hidden="true" className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div>
              <Button
                isDisabled={isSaving || savedOrder.length === 0}
                onClick={() => {
                  void save({ defaultRailOrder: [] });
                }}
                type="button"
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                {translate('reset')}
              </Button>
            </div>
          </div>

          {isSaving ? (
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
          <p className="text-xs text-muted-foreground">{translate('help')}</p>
        </>
      )}
    </Card>
  );
}
