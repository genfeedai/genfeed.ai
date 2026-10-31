import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import TrendsPlatformDetail from '@/features/trends/platform-detail/trends-platform-detail';
import {
  getTrendPlatformLabel,
  isTrendPlatform,
  type TrendPlatform,
} from '@/features/trends/shared/trends-platforms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;

  if (!isTrendPlatform(platform)) {
    return createPageMetadata('Platform Trends');
  }

  return createPageMetadata(`${getTrendPlatformLabel(platform)} Trends`);
}

export default async function DiscoveryTrendsPlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;

  if (!isTrendPlatform(platform)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <TrendsPlatformDetail platform={platform as TrendPlatform} />
    </Suspense>
  );
}
