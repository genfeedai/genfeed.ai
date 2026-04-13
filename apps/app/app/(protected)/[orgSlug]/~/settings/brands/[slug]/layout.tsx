'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useParams } from 'next/navigation';

export default function BrandSettingsLayout({ children }: LayoutProps) {
  const params = useParams();
  const brandId = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  if (!brandId) {
    return children;
  }

  const items = [
    {
      href: `/settings/brands/${brandId}`,
      id: 'overview',
      label: 'Overview',
      matchMode: 'exact' as const,
    },
    {
      href: `/settings/brands/${brandId}/voice`,
      id: 'voice',
      label: 'Voice',
    },
    {
      href: `/settings/brands/${brandId}/publishing`,
      id: 'publishing',
      label: 'Publishing',
    },
    {
      href: `/settings/brands/${brandId}/agent-defaults`,
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
