import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  getTrendPlatformLabel,
  isTrendPlatform,
  type TrendPlatform,
} from '@pages/trends/shared/trends-platforms';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import TrendsPlatformDetail from './trends-platform-detail';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;

  if (!isTrendPlatform(platform)) {
    return createPageMetadata('Social Research');
  }

  return createPageMetadata(`${getTrendPlatformLabel(platform)} Research`);
}

export default async function ResearchPlatformPage({
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
      <TrendsPlatformDetail platform={platform as TrendPlatform} />
    </Suspense>
  );
}
