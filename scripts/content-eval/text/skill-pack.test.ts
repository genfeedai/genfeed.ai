import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSkillContestants,
  loadSkill,
  MAX_SKILL_INSTRUCTION_CHARS,
  parseSkillArms,
  stripFrontmatter,
} from './skill-pack';

function skillDirectory(markdown: string): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-pack-'));
  const directory = join(root, 'a-skill');
  mkdirSync(directory);
  writeFileSync(join(directory, 'SKILL.md'), markdown);
  return directory;
}

describe('parseSkillArms', () => {
  it('reads labelled skill directories and the no-skill control, baseline first', () => {
    expect(parseSkillArms('ours=/skills/a,theirs=/skills/b,none')).toEqual([
      { directory: '/skills/a', label: 'ours' },
      { directory: '/skills/b', label: 'theirs' },
      { directory: null, label: 'none' },
    ]);
  });

  it.each([
    [undefined, 'at least two arms'],
    ['ours=/skills/a', 'at least two arms'],
    ['ours=/skills/a,ours=/skills/b', 'repeats a label'],
    ['ours=/skills/a,theirs', 'needs a skill directory'],
    ['ours=/skills/a,none=/skills/b', 'takes no directory'],
    ['Ours=/skills/a,none', 'lowercase letters'],
  ])('refuses %s', (flag, message) => {
    expect(() => parseSkillArms(flag)).toThrow(message);
  });
});

describe('loadSkill', () => {
  it('returns the body without the frontmatter', () => {
    const loaded = loadSkill(
      skillDirectory(
        '---\nname: a-skill\ndescription: x\n---\n\n# Steps\n\nDo it.\n',
      ),
    );

    expect(loaded.prompt).toBe('# Steps\n\nDo it.');
    expect(loaded.droppedChars).toBe(0);
  });

  it('cuts a body at the per-skill limit and says how much was dropped', () => {
    const body = 'x'.repeat(MAX_SKILL_INSTRUCTION_CHARS + 50);
    const loaded = loadSkill(skillDirectory(`---\nname: a\n---\n${body}`));

    expect(loaded.prompt).toHaveLength(MAX_SKILL_INSTRUCTION_CHARS);
    expect(loaded.droppedChars).toBe(50);
  });

  it('refuses a missing file and an empty body', () => {
    expect(() => loadSkill('/nonexistent/skill')).toThrow('cannot read');
    expect(() => loadSkill(skillDirectory('---\nname: a\n---\n'))).toThrow(
      'no instructions',
    );
  });

  it('leaves a document without frontmatter alone', () => {
    expect(stripFrontmatter('# Plain\n\ntext')).toBe('# Plain\n\ntext');
  });
});

describe('buildSkillContestants', () => {
  it('gives each skill arm its instructions and the control none', () => {
    const contestants = buildSkillContestants(
      'x/y',
      parseSkillArms('ours=/a,none'),
      (directory) => ({
        digest: 'd',
        droppedChars: 0,
        prompt: `skill at ${directory}`,
      }),
    );

    expect(contestants).toEqual([
      {
        guidanceArm: 'skill',
        id: 'x/y#skill:ours',
        isCompiled: false,
        registryKey: 'x/y',
        skillPrompt: 'skill at /a',
      },
      {
        guidanceArm: 'skill',
        id: 'x/y#skill:none',
        isCompiled: false,
        registryKey: 'x/y',
      },
    ]);
  });
});
