'use client';

import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { LayoutProps } from '@props/layout/layout.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { isEEEnabled } from '@/lib/config/edition';

export default function OrganizationSettingsLayout({ children }: LayoutProps) {
  const { orgHref } = useOrgUrl();
  const organizationSettingsTabs = [
    {
      href: orgHref('/settings'),
      id: 'general',
      label: 'General',
      matchMode: 'exact' as const,
    },
    {
      href: orgHref('/settings/members'),
      id: 'members',
      label: 'Members',
    },
    {
      href: orgHref('/settings/billing'),
      id: 'billing',
      label: 'Billing',
    },
    {
      href: orgHref('/settings/api-keys'),
      id: 'api-keys',
      label: 'API Keys',
    },
    {
      href: orgHref('/settings/policy'),
      id: 'policy',
      label: 'Policy',
    },
  ];
  const tabs = isEEEnabled()
    ? organizationSettingsTabs
    : organizationSettingsTabs.filter((tab) => tab.id !== 'billing');

  return (
    <div className="space-y-6">
      <Tabs items={tabs} variant="underline" fullWidth={false} />
      {children}
    </div>
  );
}
