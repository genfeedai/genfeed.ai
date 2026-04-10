import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendsPlatformDetail from '@pages/trends/platform-detail/trends-platform-detail';
import {
  getTrendPlatformLabel,
  isTrendPlatform,
  type TrendPlatform,
} from '@pages/trends/shared/trends-platforms';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

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

export default async function AnalyticsTrendsPlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;

  if (!isTrendPlatform(platform)) {
    notFound();
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TrendsPlatformDetail
        platform={platform as TrendPlatform}
        basePath="/analytics/trends"
      />
    </Suspense>
  );
}
