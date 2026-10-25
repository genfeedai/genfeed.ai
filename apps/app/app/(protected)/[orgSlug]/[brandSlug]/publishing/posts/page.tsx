import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';
import { permanentRedirect } from 'next/navigation';
import { resolveLegacyPublishingViewPath } from './legacy-view-redirect';

export const generateMetadata = createPageMetadata('Posts');

export default async function PublishingPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandSlug, orgSlug }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  const legacyPath = resolveLegacyPublishingViewPath(search);

  if (legacyPath) {
    permanentRedirect(createBrandAppRoute(orgSlug, brandSlug, legacyPath));
  }

  return <PublishingContentLibrary />;
}
