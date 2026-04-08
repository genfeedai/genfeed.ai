'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { isEEEnabled } from '@/lib/config/edition';

const ORGANIZATION_SETTINGS_TABS = [
  {
    href: '/settings/organization',
    id: 'general',
    label: 'General',
    matchMode: 'exact' as const,
  },
  {
    href: '/settings/organization/members',
    id: 'members',
    label: 'Members',
  },
  {
    href: '/settings/organization/billing',
    id: 'billing',
    label: 'Billing',
  },
  {
    href: '/settings/organization/credentials',
    id: 'credentials',
    label: 'Credentials',
  },
  {
    href: '/settings/organization/api-keys',
    id: 'api-keys',
    label: 'API Keys',
  },
  {
    href: '/settings/organization/policy',
    id: 'policy',
    label: 'Policy',
  },
];

export default function OrganizationSettingsLayout({ children }: LayoutProps) {
  const tabs = isEEEnabled()
    ? ORGANIZATION_SETTINGS_TABS
    : ORGANIZATION_SETTINGS_TABS.filter((tab) => tab.id !== 'billing');

  return (
    <div className="space-y-6">
      <Tabs items={tabs} variant="underline" fullWidth={false} />
      {children}
    </div>
  );
}
