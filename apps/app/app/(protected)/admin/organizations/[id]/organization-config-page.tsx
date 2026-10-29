'use client';

import { AlertCategory } from '@genfeedai/contracts';
import { isReleaseItemId } from '@genfeedai/contracts/constants';
import OrganizationReleaseGrants from '@protected/organizations/components/organization-release-grants';
import { OrganizationSettingsTable } from '@protected/organizations/components/organization-settings-table';
import { useOrganizationSettings } from '@protected/organizations/hooks/use-organization-settings';
import Alert from '@ui/feedback/alert/Alert';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Settings } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { readRouteParam } from '@/lib/route-params';

function OrganizationConfigPageContent() {
  const params = useParams<{ id?: string | string[] }>();
  const organizationId = readRouteParam(params?.id);

  const { settings, isLoading, isRefreshing, error, refresh, updateSettings } =
    useOrganizationSettings(organizationId);

  // Every branch declares the same chrome mode so the topbar never flips
  // between the missing-id, error and loaded states.
  if (!organizationId) {
    return (
      <AdminPageShell title="Organization Configuration" icon={Settings}>
        <Alert type={AlertCategory.WARNING}>
          Organization ID is required. Open an organization from the
          organizations list (/admin/organizations/:id).
        </Alert>
      </AdminPageShell>
    );
  }

  if (error) {
    return (
      <AdminPageShell title="Organization Configuration" icon={Settings}>
        <Alert type={AlertCategory.ERROR}>
          Failed to load organization settings. Please try again.
        </Alert>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Organization Configuration"
      icon={Settings}
      onRefresh={() => refresh()}
      isRefreshing={isRefreshing}
    >
      {settings ? (
        <OrganizationReleaseGrants
          hasOrganizationBilling={settings.hasOrganizationBilling !== false}
          isReleasePreviewEnabled={settings.isReleasePreviewEnabled === true}
          moduleOverrides={settings.moduleOverrides ?? {}}
          releasedItemIds={(settings.releasedItemIds ?? []).filter(
            isReleaseItemId,
          )}
          onModuleOverridesChange={(moduleOverrides) =>
            updateSettings({ moduleOverrides })
          }
          onReleasedItemIdsChange={(releasedItemIds) =>
            updateSettings({ releasedItemIds })
          }
        />
      ) : null}
      <OrganizationSettingsTable
        settings={settings}
        isLoading={isLoading}
        organizationId={organizationId}
        onUpdate={refresh}
      />
    </AdminPageShell>
  );
}

export default function OrganizationConfigPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationConfigPageContent />
    </Suspense>
  );
}
