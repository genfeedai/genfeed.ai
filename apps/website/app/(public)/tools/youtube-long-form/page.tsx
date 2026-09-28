import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import YoutubeLongFormContent from '@public/tools/youtube-long-form/youtube-long-form-content';
import PageLayout from '@web-components/PageLayout';
import { FileText } from 'lucide-react';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube to Article & Newsletter — Free AI Tool | Genfeed',
  'Turn a public YouTube video into a standard article, LinkedIn article, X article, or newsletter with one reusable workflow.',
  '/tools/youtube-long-form',
);

export default function YoutubeLongFormPage(): React.ReactElement {
  // The hero, footer and copy render on the server; only the tool hydrates.
  return (
    <PageLayout
      badge="Free AI tool"
      badgeIcon={FileText}
      compact
      description="Paste a public YouTube video once, reuse its transcript, and turn it into a publish-ready article or newsletter."
      title="YouTube to long-form text"
    >
      <YoutubeLongFormContent />
    </PageLayout>
  );
}
