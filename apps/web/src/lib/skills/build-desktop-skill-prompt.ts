import type { Skill } from '@services/content/skills.service';

type DesktopSkillPromptInput = Pick<
  Skill,
  | 'defaultInstructions'
  | 'description'
  | 'name'
  | 'slug'
  | 'systemPromptTemplate'
>;

/**
 * The opening prompt of the `claude` session a Desktop skill runs in. The
 * instructions travel inside it, so the local session needs neither a login
 * nor a network call to find the skill. It never begins with a dash, so the
 * CLI reads it as the prompt and not as a flag.
 */
export function buildDesktopSkillPrompt(
  skill: DesktopSkillPromptInput,
): string {
  const instructions =
    [skill.systemPromptTemplate, skill.defaultInstructions, skill.description]
      .map((source) => source?.trim())
      .find(Boolean) ?? '';

  return [
    `Use the Genfeed skill "${skill.name}" (${skill.slug}) in this session.`,
    'Ask me what I want to make, then follow the skill instructions below. Ask before you run a command or write a file.',
    '',
    '--- Skill instructions ---',
    instructions,
  ].join('\n');
}
