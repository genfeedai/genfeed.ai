import { getToolRelatedLinks } from '@data/related-links.data';
import YoutubeClipperContent from '@public/tools/youtube-clipper/youtube-clipper-content';
import RelatedLinks from '@web-components/content/RelatedLinks';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import PageLayout from '@web-components/PageLayout';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube Transcript to Clips — Free AI Tool',
  'Turn a public YouTube video into a timestamped transcript, three clip recommendations, and one free preview clip.',
  '/tools/youtube-clipper',
);

export default function YoutubeClipperPage(): React.ReactElement {
  // The hero, footer and copy render on the server; only the tool hydrates.
  return (
    <PageLayout
      compact
      description="Paste a public YouTube URL. Get a timestamped transcript, three AI-selected short-form moments, and one rendered preview before signup."
      title="YouTube transcript to clips"
    >
      <YoutubeClipperContent />
      <RelatedLinks
        links={getToolRelatedLinks('/tools/youtube-clipper')}
        title="More free tools"
      />
    </PageLayout>
  );
}
