import {
  ORGANIZATION_MODULE_IDS,
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
  RELEASE_ITEM_IDS,
  type ReleaseItemId,
} from '@genfeedai/contracts/constants';
import type { OrganizationReleaseGrantsProps } from '@genfeedai/props/admin/organization-release-grants.props';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

/**
 * Admin → Organization: choose which apps one organization sees. "Released"
 * opens an individual app that Admin → Flags has not released for everyone;
 * "Shown" is the organization's own Modules switch, which only hides the app
 * from its members (API and MCP work keeps running). Release preview (the
 * settings matrix) still opens every app at once.
 */
export default function OrganizationReleaseGrants({
  hasOrganizationBilling,
  isReleasePreviewEnabled,
  moduleOverrides,
  releasedItemIds,
  onModuleOverridesChange,
  onReleasedItemIdsChange,
}: OrganizationReleaseGrantsProps) {
  const translate = useTranslations('pages.adminOrganizationReleases');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const run = useCallback(async (key: string, save: () => Promise<void>) => {
    setPendingKey(key);
    try {
      await save();
    } catch {
      // Errors handled by hook
    } finally {
      setPendingKey(null);
    }
  }, []);

  const handleRelease = useCallback(
    (itemId: ReleaseItemId, isReleased: boolean) =>
      run(`release:${itemId}`, () =>
        onReleasedItemIdsChange(
          RELEASE_ITEM_IDS.filter((id) =>
            id === itemId ? isReleased : releasedItemIds.includes(id),
          ),
        ),
      ),
    [onReleasedItemIdsChange, releasedItemIds, run],
  );

  const handleShown = useCallback(
    (moduleId: OrganizationModuleId, isShown: boolean) =>
      run(`shown:${moduleId}`, () =>
        onModuleOverridesChange({ ...moduleOverrides, [moduleId]: isShown }),
      ),
    [moduleOverrides, onModuleOverridesChange, run],
  );

  const isShown = (moduleId: OrganizationModuleId): boolean =>
    moduleOverrides[moduleId] ??
    (!hasOrganizationBilling ||
      ORGANIZATION_MODULES[moduleId].isDefaultEnabled);

  return (
    <WorkspaceSurface
      eyebrow={translate('title')}
      title={translate('grantsTitle')}
      tone="muted"
      data-testid="organization-release-grants"
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <p className="text-sm text-foreground/60">
            {translate(
              isReleasePreviewEnabled ? 'grantsPreviewHelp' : 'grantsHelp',
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RELEASE_ITEM_IDS.map((itemId) => (
              <Switch
                key={itemId}
                aria-label={`release ${itemId}`}
                isChecked={releasedItemIds.includes(itemId)}
                isDisabled={pendingKey !== null}
                label={`release ${itemId}`}
                onCheckedChange={(isReleased) => {
                  void handleRelease(itemId, isReleased);
                }}
              />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <p className="text-sm text-foreground/60">
            {translate('visibilityHelp')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ORGANIZATION_MODULE_IDS.map((moduleId) => (
              <Switch
                key={moduleId}
                aria-label={`show ${moduleId}`}
                isChecked={isShown(moduleId)}
                isDisabled={pendingKey !== null}
                label={`show ${moduleId}`}
                onCheckedChange={(isChecked) => {
                  void handleShown(moduleId, isChecked);
                }}
              />
            ))}
          </div>
        </section>
      </div>
    </WorkspaceSurface>
  );
}
