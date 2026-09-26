'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { AlertCategory } from '@genfeedai/contracts';
import { OrganizationSettingsTable } from '@protected/organization/components/organization-settings-table';
import { useOrganizationSettings } from '@protected/organization/hooks/use-organization-settings';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { Settings } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function OrganizationConfigPageContent() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('id');

  const { settings, isLoading, isRefreshing, error, refresh } =
    useOrganizationSettings(organizationId);

  // This page never uses headerTabs/tabs, so `moduleChrome={false}` here
  // never changes what renders today — but the loaded branch below is the
  // only one of these three with `right`, and declaring the mode explicitly
  // on all three keeps that true if module chrome (tabs, a search `leading`)
  // is ever added to only one of them later.
  if (!organizationId) {
    return (
      <Container
        label="Organization Configuration"
        description="Configure organization settings and preferences"
        icon={Settings}
        moduleChrome={false}
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
        icon={Settings}
        moduleChrome={false}
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
      icon={Settings}
      moduleChrome={false}
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

export default function OrganizationConfigPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationConfigPageContent />
    </Suspense>
  );
}
