import YoutubeOutliersContent from '@public/tools/youtube-outliers/youtube-outliers-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import PageLayout from '@web-components/PageLayout';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube Outlier Finder',
  'Paste a YouTube channel and see the videos that got far more views than that channel usually gets. Free, no signup.',
  '/tools/youtube-outliers',
);

export default function YoutubeOutliersPage(): React.ReactElement {
  // The hero, footer and copy render on the server; only the tool hydrates.
  return (
    <PageLayout
      compact
      description="Paste a YouTube channel. See its videos that beat the channel's usual views by 3x or more, then remix the idea."
      title="YouTube outlier finder"
    >
      <YoutubeOutliersContent />
    </PageLayout>
  );
}
