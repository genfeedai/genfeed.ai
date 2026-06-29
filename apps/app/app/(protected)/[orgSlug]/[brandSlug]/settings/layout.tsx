'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useParams } from 'next/navigation';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function BrandSettingsLayout({ children }: LayoutProps) {
  const params = useParams<{ brandSlug?: string; orgSlug?: string }>();
  const { brandSlug, orgSlug } = params;

  if (!orgSlug || !brandSlug) {
    return children;
  }

  const settingsHref = (path = '') =>
    `/${orgSlug}/${brandSlug}/settings${path}`;

  const items = [
    {
      href: settingsHref(),
      id: 'overview',
      label: 'Overview',
      matchMode: 'exact' as const,
    },
    {
      href: settingsHref('/voice'),
      id: 'voice',
      label: 'Voice',
    },
    {
      href: settingsHref('/harness'),
      id: 'harness',
      label: 'Harness',
    },
    {
      href: settingsHref('/interview'),
      id: 'interview',
      label: 'Interview',
    },
    {
      href: settingsHref('/publishing'),
      id: 'publishing',
      label: 'Publishing',
    },
    {
      href: settingsHref('/agent-defaults'),
      id: 'agent-defaults',
      label: 'Agent Defaults',
    },
  ];

  return (
    <Container
      label="Brand Settings"
      description="Manage voice, harness, publishing, and agent defaults for this brand"
      icon={HiOutlineCog6Tooth}
    >
      <div className="space-y-6">
        <Tabs items={items} variant="underline" fullWidth={false} />
        {children}
      </div>
    </Container>
  );
}
