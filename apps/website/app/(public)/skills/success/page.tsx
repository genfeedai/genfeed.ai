import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import SkillsSuccessContent from '@public/skills/success/skills-success-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Purchase Complete',
  'Your skills purchase is complete. Follow the instructions to install your new skills.',
  '/skills/success',
);

export default function SkillsSuccess() {
  return <SkillsSuccessContent />;
}
