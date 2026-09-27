import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import { getPublicModels } from '@public/models/models-loader';
import StudioContent from '@public/studio/studio-content';

/**
 * The catalog is the same for every visitor, so the page is rendered once and
 * served from the full route cache instead of re-rendering per request. Five
 * minutes keeps a registry change (or a render made while the API was down,
 * which shows the catalog-unavailable state) short-lived; the catalog fetch
 * itself stays in the data cache for an hour.
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
