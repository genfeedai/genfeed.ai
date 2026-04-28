'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useParams } from 'next/navigation';

export default function BrandSettingsLayout({ children }: LayoutProps) {
  const params = useParams<{
    brandSlug?: string;
    orgSlug?: string;
    slug?: string | string[];
  }>();
  const routeBrandSlug =
    params?.brandSlug ??
    (Array.isArray(params?.slug) ? params.slug[0] : params?.slug);
  const orgSlug = params?.orgSlug;

  if (!orgSlug || !routeBrandSlug) {
    return children;
  }

  const settingsHref = (path = '') =>
    `/${orgSlug}/${routeBrandSlug}/settings${path}`;

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
    <div className="space-y-6">
      <Tabs items={items} variant="underline" fullWidth={false} />
      {children}
    </div>
  );
}
