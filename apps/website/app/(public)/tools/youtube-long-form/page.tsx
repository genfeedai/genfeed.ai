import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import YoutubeLongFormContent from '@public/tools/youtube-long-form/youtube-long-form-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'YouTube to Article & Newsletter — Free AI Tool | Genfeed',
  'Turn a public YouTube video into a standard article, LinkedIn article, X article, or newsletter with one reusable workflow.',
  '/tools/youtube-long-form',
);

export default function YoutubeLongFormPage(): React.ReactElement {
  return <YoutubeLongFormContent />;
}
