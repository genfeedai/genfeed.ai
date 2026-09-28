import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ModelsContent from '@public/models/models-content';
import { getPublicModels } from '@public/models/models-loader';

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
  'AI Model Catalog',
  'Browse the current image, video, voice, music, and language models available in Genfeed. The catalog updates automatically from the product registry.',
  '/models',
);

export default async function ModelsPage() {
  const models = await getPublicModels();

  return <ModelsContent models={models} />;
}
