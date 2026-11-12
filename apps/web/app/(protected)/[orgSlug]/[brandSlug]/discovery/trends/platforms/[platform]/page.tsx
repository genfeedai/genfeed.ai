import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  getTrendPlatformLabel,
  isTrendPlatform,
} from '@/features/trends/shared/trends-platforms';
import TrendsPlatformRoute from './TrendsPlatformRoute';

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

export default function DiscoveryTrendsPlatformPage() {
  return <TrendsPlatformRoute />;
}
