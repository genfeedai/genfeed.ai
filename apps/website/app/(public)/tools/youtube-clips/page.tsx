import YoutubeClipsContent from '@public/tools/youtube-clips/youtube-clips-content';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import PageLayout from '@web-components/PageLayout';
import { Scissors } from 'lucide-react';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube Transcript to Clips — Free AI Tool',
  'Turn a public YouTube video into a timestamped transcript, three clip recommendations, and one free preview clip.',
  '/tools/youtube-clips',
);

export default function YoutubeClipsPage(): React.ReactElement {
  // The hero, footer and copy render on the server; only the tool hydrates.
  return (
    <PageLayout
      heroMedia={
        <MarketingArtwork
          page="/tools/youtube-clips"
          isCompact
          kind="creator"
        />
      }
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
