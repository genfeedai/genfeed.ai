import { describe, expect, it } from 'vitest';

import { buildDesktopSkillPrompt } from './build-desktop-skill-prompt';

const skill = {
  defaultInstructions: 'Default body',
  description: 'Render a previs',
  name: 'Three.js Previs',
  slug: 'threejs-previs',
  systemPromptTemplate: 'Template body',
};

describe('buildDesktopSkillPrompt', () => {
  it('opens on the skill name and slug and carries the template instructions', () => {
    expect(buildDesktopSkillPrompt(skill)).toBe(
      [
        'Use the Genfeed skill "Three.js Previs" (threejs-previs) in this session.',
        'Ask me what I want to make, then follow the skill instructions below. Ask before you run a command or write a file.',
        '',
        '--- Skill instructions ---',
        'Template body',
      ].join('\n'),
    );
  });

  it.each([
    [{ systemPromptTemplate: '' }, 'Default body'],
    [
      { defaultInstructions: undefined, systemPromptTemplate: '  ' },
      'Render a previs',
    ],
  ])('falls back to the next instruction source %j', (override, expected) => {
    expect(
      buildDesktopSkillPrompt({ ...skill, ...override }).endsWith(expected),
    ).toBe(true);
  });
});
