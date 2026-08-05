import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import { FREE_SKILL_COUNT } from '@public/skills/_data';
import SkillsContent from '@public/skills/skills-content';
import { getSkillsRegistry } from '@public/skills/skills-loader';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Skills for Content, SEO and GTM',
  `${FREE_SKILL_COUNT} open-source Claude Code skills for content, SEO, advertising, image prompting, and GTM strategy. Install with: bunx skills add genfeedai/skills`,
  '/skills',
);

export default async function Skills() {
  const initialRegistry = await getSkillsRegistry();

  return <SkillsContent initialRegistry={initialRegistry} />;
}
