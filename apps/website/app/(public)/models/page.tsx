import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ModelsContent from '@public/models/models-content';
import { getPublicModels } from '@public/models/models-loader';

/**
 * The catalog is the same for every visitor, so the page is rendered once and
 * served from the full route cache instead of re-rendering per request. Five
 * minutes keeps a registry change (or a render made while the API was down,
 * which shows the catalog-unavailable state) short-lived; the catalog fetch
 * itself stays in the data cache for an hour.
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
