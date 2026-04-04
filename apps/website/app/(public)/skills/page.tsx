import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import SkillsContent from '@public/skills/skills-content';
import { getSkillsRegistry } from '@public/skills/skills-loader';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Skills for Content Creation, SEO & Advertising',
  '22 open-source Claude Code skills for content creation, SEO optimization, advertising, image prompting, and strategy. Install with one command: npx skills add genfeedai/skills',
  '/skills',
);

export default async function Skills() {
  const initialRegistry = await getSkillsRegistry();

  return <SkillsContent initialRegistry={initialRegistry} />;
}
