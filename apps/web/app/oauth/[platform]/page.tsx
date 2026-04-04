import OAuthPlatformForm from '@app/oauth/[platform]/oauth-platform-form';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { OAuthPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createDynamicPageMetadata(
  'platform',
  (platform) =>
    `Connect ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
);

export default async function OAuthPlatformPage({ params }: OAuthPageProps) {
  const { platform } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback />}>
      <OAuthPlatformForm platform={platform} />
    </Suspense>
  );
}
