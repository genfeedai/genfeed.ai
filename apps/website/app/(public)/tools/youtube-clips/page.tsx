import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import YoutubeClipsContent from '@public/tools/youtube-clips/youtube-clips-content';
import PageLayout from '@web-components/PageLayout';
import { Scissors } from 'lucide-react';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube Transcript to Clips — Free AI Tool | Genfeed',
  'Turn a public YouTube video into a timestamped transcript, three clip recommendations, and one free preview clip.',
  '/tools/youtube-clips',
);

export default function YoutubeClipsPage(): React.ReactElement {
  // The hero, footer and copy render on the server; only the tool hydrates.
  return (
    <PageLayout
      badge="Free AI tool"
      badgeIcon={Scissors}
      compact
      description="Paste a public YouTube URL. Get a timestamped transcript, three AI-selected short-form moments, and one rendered preview before signup."
      title="YouTube transcript to clips"
    >
      <YoutubeClipsContent />
    </PageLayout>
  );
}
