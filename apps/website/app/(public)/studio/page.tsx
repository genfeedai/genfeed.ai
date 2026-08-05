import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import StudioContent from '@public/studio/studio-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Studio: Video, Image and Music',
  'Generate video, image, and music with 7+ frontier AI models including Google Veo 3, Imagen 4, and OpenAI Sora 2, all in one workspace.',
  '/studio',
);

export default function Studio() {
  return <StudioContent />;
}
