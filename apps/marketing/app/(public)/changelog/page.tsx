import { getPublishedReleases } from '@data/releases.data';
import { logger } from '@services/core/logger.service';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import ChangelogContent from './content';

export const revalidate = 300;
export const generateMetadata = createPageMetadataWithCanonical(
  'Product Updates and Changelog',
  'Follow Genfeed releases, new content creation features, publishing improvements, and fixes across the platform, with links to each release.',
  '/changelog',
);
export default async function Changelog() {
  try {
    return <ChangelogContent releases={await getPublishedReleases()} />;
  } catch (error) {
    // The releases API can reject us (403 rate limit) or time out. Show a
    // recoverable state with a GitHub link instead of a 500 on a public page.
    logger.warn('GET /changelog degraded: releases source unavailable', {
      error,
    });
    return <ChangelogContent isUnavailable releases={[]} />;
  }
}
