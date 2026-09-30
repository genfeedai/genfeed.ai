import { getPublishedReleases } from '@data/releases.data';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import ChangelogContent from './content';

export const revalidate = 300;
export const generateMetadata = createPageMetadataWithCanonical(
  'Product Updates and Changelog',
  'Follow Genfeed releases, new content creation features, publishing improvements, and fixes across the platform, with links to each release.',
  '/changelog',
);
export default async function Changelog() {
  return <ChangelogContent releases={await getPublishedReleases()} />;
}
