import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CoreContent from '@public/core/core-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Core (Open Source)',
  'The open-source AI content engine. Deploy on your infrastructure, bring your own AI keys, full API access. Free forever.',
  '/core',
);

export default function Core() {
  return <CoreContent />;
}
