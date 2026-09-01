import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import { getPublicModels } from '@public/models/models-loader';
import StudioContent from '@public/studio/studio-content';

export const dynamic = 'force-dynamic';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Studio: Video, Image and Music',
  'Generate video, images, voice, music, and written content from one workspace with a model catalog that updates from the product registry.',
  '/studio',
);

export default async function Studio() {
  const models = await getPublicModels();

  return <StudioContent models={models} />;
}
