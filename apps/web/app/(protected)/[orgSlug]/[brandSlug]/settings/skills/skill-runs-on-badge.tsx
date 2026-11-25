import { SkillRunsOn } from '@genfeedai/contracts';
import { resolveSkillRunsOn } from '@genfeedai/helpers';
import type { Skill } from '@services/content/skills.service';
import { Badge } from '@ui/primitives/badge';
import { Monitor } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Where a skill runs: Desktop is highlighted, Web is the quiet default. */
export default function SkillRunsOnBadge({
  skill,
}: {
  skill: Pick<Skill, 'runsOn'>;
}) {
  const translate = useTranslations('common.settings.skills');

  return resolveSkillRunsOn(skill) === SkillRunsOn.DESKTOP ? (
    <Badge icon={<Monitor className="size-3" />} variant="info">
      {translate('runsOn.desktop')}
    </Badge>
  ) : (
    <Badge variant="outline">{translate('runsOn.web')}</Badge>
  );
}
