import { getPublicModels } from '@public/models/models-loader';
import StudioContent from '@public/studio/studio-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

/**
 * The catalog is the same for every visitor, so the page is rendered once and
 * served from the full route cache instead of re-rendering per request. The
 * route regenerates every five minutes, which bounds how long a render made
 * while the API was down (the catalog-unavailable state) is served. Registry
 * changes can take up to an hour to appear: `getPublicModels` keeps the
 * catalog fetch in the data cache for that long, as it did before.
 */
export const revalidate = 300;

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Studio: Video, Image and Music',
  'Generate video, images, voice, music, and written content from one workspace with a model catalog that updates from the product registry.',
  '/studio',
);

export default async function Studio() {
  const models = await getPublicModels();

  return <StudioContent models={models} />;
}
