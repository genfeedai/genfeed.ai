import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ModelsContent from '@public/models/models-content';
import { getPublicModels } from '@public/models/models-loader';

export const dynamic = 'force-dynamic';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Model Catalog',
  'Browse the current image, video, voice, music, and language models available in Genfeed. The catalog updates automatically from the product registry.',
  '/models',
);

export default async function ModelsPage() {
  const models = await getPublicModels();

  return <ModelsContent models={models} />;
}
