import { SkillRunsOn } from '@genfeedai/contracts';

/**
 * The tag `genfeedai/skills` puts in a skill's `metadata.json` when it needs
 * the member's own machine (Chrome, ffmpeg, a local render).
 */
export const DESKTOP_SKILL_TAG = 'local';

export function isSkillRunsOn(value: unknown): value is SkillRunsOn {
  return value === SkillRunsOn.DESKTOP || value === SkillRunsOn.WEB;
}

/**
 * Where a skill executes. Custom and imported skills, and catalog rows written
 * before `runsOn` existed, carry no value and run on web.
 */
export function resolveSkillRunsOn(skill: {
  runsOn?: string | null;
}): SkillRunsOn {
  return isSkillRunsOn(skill.runsOn) ? skill.runsOn : SkillRunsOn.WEB;
}

export function inferSkillRunsOn(tags: readonly string[]): SkillRunsOn {
  return tags.includes(DESKTOP_SKILL_TAG)
    ? SkillRunsOn.DESKTOP
    : SkillRunsOn.WEB;
}
