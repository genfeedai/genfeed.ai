'use client';

import { usePathname } from 'next/navigation';
import { AppRail } from '@/components/shell/app-rail/AppRail';
import { FeatureFlagProvider } from '@/hooks/feature-flags/provider';
import type { BootRecord } from '@/props/layout/boot-record.props';

/**
 * The rail as it was the last time the organization was confirmed for this
 * member, drawn from the device before any request has answered. It is the
 * real rail, handed the stored inputs instead of the live ones, so the apps
 * and their order are the member's own. It reads and fetches nothing
 * tenant-scoped; its links are ordinary navigation, and the live rail replaces
 * it once the organization is confirmed.
 */
export default function BootRecordRail({ record }: { record: BootRecord }) {
  const pathname = usePathname() ?? '';
  const { rail } = record;

  return (
    <FeatureFlagProvider defaults={rail.flags}>
      <AppRail
        brandAwareSlug={rail.brandAwareSlug}
        brandSlug={rail.brandSlug}
        currentPath={pathname}
        hiddenAppIds={rail.hiddenAppIds}
        installedAppIds={rail.installedAppIds}
        isAssetGateLocked={rail.isAssetGateLocked}
        moduleAccess={rail.moduleAccess}
        modulePreferences={rail.modulePreferences}
        orgSlug={record.organizationSlug}
        pinnedAppIds={rail.pinnedAppIds}
        railAppOrder={rail.railAppOrder}
        releaseVisibility={rail.releaseVisibility}
        showAdmin={rail.showAdmin}
        surface="desktop"
      />
    </FeatureFlagProvider>
  );
}
