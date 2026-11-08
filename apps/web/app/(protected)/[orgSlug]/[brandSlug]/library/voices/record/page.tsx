import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import VoiceStudio from '@/features/voice-studio/voice-studio';

export const generateMetadata = createPageMetadata('Record your voice');

export default function LibraryVoiceStudioPage() {
  return <VoiceStudio />;
}
