import {
  RELEASE_ITEM_IDS,
  type ReleaseItemId,
} from '@genfeedai/contracts/constants';
import type { OrganizationReleaseGrantsProps } from '@genfeedai/props/admin/organization-release-grants.props';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

/**
 * Admin → Organization: open individual release items for one organization
 * while the rest of the platform keeps waiting on Admin → Flags. Release
 * preview (the settings matrix) still opens every item at once.
 */
export default function OrganizationReleaseGrants({
  releasedItemIds,
  isReleasePreviewEnabled,
  onChange,
}: OrganizationReleaseGrantsProps) {
  const translate = useTranslations('pages.adminOrganizationReleases');
  const [pendingItemId, setPendingItemId] = useState<ReleaseItemId | null>(
    null,
  );

  const handleToggle = useCallback(
    async (itemId: ReleaseItemId, isReleased: boolean) => {
      setPendingItemId(itemId);
      try {
        await onChange(
          RELEASE_ITEM_IDS.filter((id) =>
            id === itemId ? isReleased : releasedItemIds.includes(id),
          ),
        );
      } catch {
        // Errors handled by hook
      } finally {
        setPendingItemId(null);
      }
    },
    [onChange, releasedItemIds],
  );

  return (
    <WorkspaceSurface
      eyebrow={translate('title')}
      title={translate('grantsTitle')}
      tone="muted"
      data-testid="organization-release-grants"
    >
      <p className="mb-4 text-sm text-foreground/60">
        {translate(
          isReleasePreviewEnabled ? 'grantsPreviewHelp' : 'grantsHelp',
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RELEASE_ITEM_IDS.map((itemId) => (
          <Switch
            key={itemId}
            aria-label={itemId}
            isChecked={releasedItemIds.includes(itemId)}
            isDisabled={pendingItemId !== null}
            label={itemId}
            onCheckedChange={(isReleased) => {
              void handleToggle(itemId, isReleased);
            }}
          />
        ))}
      </div>
    </WorkspaceSurface>
  );
}
