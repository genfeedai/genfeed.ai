import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ExpertsContent from '@public/experts/experts-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Brand OS for Experts, Coaches and Founders',
  'Genfeed turns your interviews, talks, and call notes into a scored positioning system and a content plan you review and approve before anything publishes.',
  '/experts',
);

export default function ExpertsPage() {
  return <ExpertsContent />;
}
