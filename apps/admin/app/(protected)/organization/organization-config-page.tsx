'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { AlertCategory } from '@genfeedai/enums';
import { OrganizationSettingsTable } from '@protected/organization/components/organization-settings-table';
import { useOrganizationSettings } from '@protected/organization/hooks/use-organization-settings';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { useSearchParams } from 'next/navigation';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function OrganizationConfigPage() {
  const searchParams = useSearchParams();
  const organizationId = searchParams?.get('id');

  const { settings, isLoading, isRefreshing, error, refresh } =
    useOrganizationSettings(organizationId);

  if (!organizationId) {
    return (
      <Container
        label="Organization Configuration"
        description="Configure organization settings and preferences"
        icon={HiOutlineCog6Tooth}
      >
        <Alert type={AlertCategory.WARNING}>
          Organization ID is required. Please provide an organization ID in the
          URL query parameters (e.g., /organization?id=...).
        </Alert>
      </Container>
    );
  }

  if (error) {
    return (
      <Container
        label="Organization Configuration"
        description="Configure organization settings and preferences"
        icon={HiOutlineCog6Tooth}
      >
        <Alert type={AlertCategory.ERROR}>
          Failed to load organization settings. Please try again.
        </Alert>
      </Container>
    );
  }

  return (
    <Container
      label="Organization Configuration"
      description="Configure organization settings and preferences"
      icon={HiOutlineCog6Tooth}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      <OrganizationSettingsTable
        settings={settings}
        isLoading={isLoading}
        organizationId={organizationId}
        onUpdate={refresh}
      />
    </Container>
  );
}
