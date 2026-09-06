import { getPublishedReleases } from '@data/releases.data';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ChangelogContent from './content';

export const revalidate = 300;
export const generateMetadata = createPageMetadataWithCanonical(
  'Changelog',
  'The latest Genfeed releases, improvements, and fixes.',
  '/changelog',
);
export default async function Changelog() {
  return <ChangelogContent releases={await getPublishedReleases()} />;
}
