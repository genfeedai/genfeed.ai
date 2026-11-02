import {
  getReleaseFlagKey,
  isReleaseItemId,
  isReleaseItemVisible,
  ORGANIZATION_MODULE_IDS,
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
  RELEASE_ITEM_IDS,
  type ReleaseItemId,
} from '@genfeedai/contracts/constants';
import Table from '@ui/display/table/Table';
import TableGroupHeading from '@ui/display/table/TableGroupHeading';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import type {
  OrganizationAppAccessProps,
  OrganizationAppAccessRow,
} from '@/features/admin/props/organization-app-access.props';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';

const ANALYTICS_PAGE_PREFIX = 'analytics_';

/** Release items that are not an app of their own: Campaigns and the Analytics pages. */
const RELEASE_ONLY_ITEM_IDS = RELEASE_ITEM_IDS.filter(
  (itemId) => !(itemId in ORGANIZATION_MODULES),
);

/**
 * Admin → Organization: one list of apps, one switch each. On means the
 * organization's members see the app: it is released for them (everyone, or
 * early access for this organization) and not hidden by the organization's own
 * Modules switch. Hiding only removes the app from their Store and rail; API
 * and MCP work keeps running.
 */
export default function OrganizationAppAccess({
  hasOrganizationBilling,
  isReleasePreviewEnabled,
  moduleOverrides,
  releasedItemIds,
  onChange,
}: OrganizationAppAccessProps) {
  const translate = useTranslations('pages.adminOrganizationReleases');
  const { flags, isReady } = usePlatformFlags();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const audience = useMemo(
    () => ({
      hasOrganizationBilling,
      isReleasePreviewEnabled,
      releasedItemIds,
    }),
    [hasOrganizationBilling, isReleasePreviewEnabled, releasedItemIds],
  );
  const isReleased = useCallback(
    (itemId: ReleaseItemId): boolean =>
      isReleaseItemVisible(itemId, audience, flags),
    [audience, flags],
  );
  const isShown = useCallback(
    (moduleId: OrganizationModuleId): boolean =>
      moduleOverrides[moduleId] ??
      (!hasOrganizationBilling ||
        ORGANIZATION_MODULES[moduleId].isDefaultEnabled),
    [hasOrganizationBilling, moduleOverrides],
  );

  // Only what the switch cannot say: how the app was released. Release preview
  // opens every app, so there is nothing to add.
  const getReleaseDescription = useCallback(
    (itemId: ReleaseItemId): string | null => {
      if (!isReady || isReleasePreviewEnabled) return null;
      if (flags[getReleaseFlagKey(itemId)] === true) {
        return translate('releasedForEveryone');
      }
      return releasedItemIds.includes(itemId) ? translate('earlyAccess') : null;
    },
    [flags, isReady, isReleasePreviewEnabled, releasedItemIds, translate],
  );

  const rows = useMemo<OrganizationAppAccessRow[]>(() => {
    const appRows = ORGANIZATION_MODULE_IDS.map(
      (moduleId): OrganizationAppAccessRow => {
        const hasRelease = isReleaseItemId(moduleId);
        return {
          description: hasRelease ? getReleaseDescription(moduleId) : null,
          group: 'apps',
          id: moduleId,
          isLocked: false,
          isOn: isShown(moduleId) && (!hasRelease || isReleased(moduleId)),
          label: ORGANIZATION_MODULES[moduleId].label,
        };
      },
    );
    const releaseOnlyRows = RELEASE_ONLY_ITEM_IDS.map(
      (itemId): OrganizationAppAccessRow => ({
        description: getReleaseDescription(itemId),
        group: itemId.startsWith(ANALYTICS_PAGE_PREFIX)
          ? 'analyticsPages'
          : 'apps',
        id: itemId,
        isLocked: isReady && flags[getReleaseFlagKey(itemId)] === true,
        isOn: isReleased(itemId),
        label: translate(`items.${itemId}`),
      }),
    );
    // Apps first, then the Analytics pages, so each group stays contiguous.
    return [...appRows, ...releaseOnlyRows].sort(
      (a, b) =>
        Number(a.group === 'analyticsPages') -
        Number(b.group === 'analyticsPages'),
    );
  }, [flags, getReleaseDescription, isReady, isReleased, isShown, translate]);

  const handleToggle = useCallback(
    async (row: OrganizationAppAccessRow, isOn: boolean) => {
      const grant = (itemId: ReleaseItemId, isGranted: boolean) =>
        RELEASE_ITEM_IDS.filter((id) =>
          id === itemId ? isGranted : releasedItemIds.includes(id),
        );

      setPendingId(row.id);
      try {
        if (row.id in ORGANIZATION_MODULES) {
          const moduleId = row.id as OrganizationModuleId;
          await onChange({
            moduleOverrides: { ...moduleOverrides, [moduleId]: isOn },
            ...(isOn && isReleaseItemId(moduleId) && !isReleased(moduleId)
              ? { releasedItemIds: grant(moduleId, true) }
              : {}),
          });
        } else if (isReleaseItemId(row.id)) {
          await onChange({ releasedItemIds: grant(row.id, isOn) });
        }
      } catch {
        // Errors handled by hook
      } finally {
        setPendingId(null);
      }
    },
    [isReleased, moduleOverrides, onChange, releasedItemIds],
  );

  const columns = useMemo(
    () => [
      {
        header: translate('appColumn'),
        key: 'label' as const,
        render: (row: OrganizationAppAccessRow) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.label}</span>
            {row.description ? (
              <span className="text-xs text-muted-foreground">
                {row.description}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        className: 'w-0',
        header: translate('accessColumn'),
        key: 'isOn' as const,
        render: (row: OrganizationAppAccessRow) => (
          <Switch
            aria-label={row.label}
            isChecked={row.isOn}
            isDisabled={pendingId !== null || row.isLocked}
            size="sm"
            onCheckedChange={(isOn) => {
              void handleToggle(row, isOn);
            }}
          />
        ),
      },
    ],
    [handleToggle, pendingId, translate],
  );

  return (
    <WorkspaceSurface
      title={translate('appsTitle')}
      tone="muted"
      flush
      data-testid="organization-app-access"
    >
      <Table<OrganizationAppAccessRow>
        ariaLabel={translate('appsTitle')}
        columns={columns}
        framed={false}
        // The first group is the section itself; only the Analytics pages
        // need a label of their own.
        getGroupHeading={(row) =>
          row.group === 'analyticsPages'
            ? {
                content: (
                  <TableGroupHeading>
                    {translate('analyticsPagesGroup')}
                  </TableGroupHeading>
                ),
                key: row.group,
              }
            : null
        }
        getRowKey={(row) => row.id}
        hideHeader
        items={rows}
      />
    </WorkspaceSurface>
  );
}
