import type { BrandKitTabRouteProps } from '@props/settings/brand-kit-tab-route.props';
import { notFound } from 'next/navigation';
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
