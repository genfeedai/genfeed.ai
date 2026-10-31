import SkillsSuccessContent from '@public/skills/success/skills-success-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Purchase Complete',
  'Your skills purchase is complete. Follow the instructions to install your new skills.',
  '/skills/success',
);

export default function SkillsSuccess() {
  return <SkillsSuccessContent />;
}
