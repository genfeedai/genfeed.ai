import { formatPlatformLabel, parsePlatform } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { BrandPlatformHomePageProps } from '@props/pages/page.props';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import PlatformHomePage from './content';

export async function generateMetadata({ params }: BrandPlatformHomePageProps) {
  const { platform } = await params;
  const parsed = parsePlatform(platform);
  const label = formatPlatformLabel(parsed ?? platform) ?? 'Platform';

  return createPageMetadata(`${label} home`);
}

export default async function BrandPlatformHomeRoute({
  params,
}: BrandPlatformHomePageProps) {
  const { platform } = await params;
  const parsed = parsePlatform(platform);

  if (!parsed) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <PlatformHomePage platform={parsed} />
    </Suspense>
  );
}
