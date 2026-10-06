import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import GenerationReceiptsContent from './content';
export const generateMetadata = createPageMetadata('Generation receipts');
export default function GenerationReceiptsPage() {
  return <GenerationReceiptsContent />;
}
