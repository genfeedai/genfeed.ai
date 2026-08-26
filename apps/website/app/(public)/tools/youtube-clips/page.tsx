import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import YoutubeClipsContent from '@public/tools/youtube-clips/youtube-clips-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube Transcript to Clips — Free AI Tool | Genfeed',
  'Turn a public YouTube video into a timestamped transcript, three clip recommendations, and one free preview clip.',
  '/tools/youtube-clips',
);

export default function YoutubeClipsPage(): React.ReactElement {
  return <YoutubeClipsContent />;
}
