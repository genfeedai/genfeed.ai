import { notFound } from 'next/navigation';
import type { BrandKitTabRouteProps } from '@/features/settings/props/brand-kit-tab-route.props';
import { isBrandKitPathTab } from '../../brand-kit-tabs';

export default async function BrandKitTabRoute({
  params,
}: BrandKitTabRouteProps) {
  const { tab } = await params;

  if (!isBrandKitPathTab(tab)) {
    notFound();
  }

  return null;
}
