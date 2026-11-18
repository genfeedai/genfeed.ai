import { formatPlatformLabel, parsePlatform } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { BrandPlatformHomePageProps } from '@/props/pages/page.props';
import PlatformHomeRoute from './PlatformHomeRoute';

export async function generateMetadata({ params }: BrandPlatformHomePageProps) {
  const { platform } = await params;
  const parsed = parsePlatform(platform);
  const label = formatPlatformLabel(parsed ?? platform) ?? 'Platform';

  return createPageMetadata(`${label} home`);
}

export default function BrandPlatformHomePage() {
  return <PlatformHomeRoute />;
}
