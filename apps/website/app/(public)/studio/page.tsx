import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import StudioContent from '@public/studio/studio-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Studio',
  'Generate videos, images, and music with 7+ cutting-edge AI models including Google Veo 3, Imagen 4, and OpenAI Sora 2. The complete AI content creation workspace.',
  '/studio',
);

export default function Studio() {
  return <StudioContent />;
}
