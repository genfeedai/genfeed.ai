import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ORIGINAL_BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-catalog-identity';
import { describe, expect, it } from 'vitest';

import {
  loadFirstPartySkillDefinitions,
  resolveProductSkillsDirectory,
} from './first-party-skill-loader';

describe('first-party skill loader', () => {
  it('loads every skills/*/SKILL.md directory as a catalog definition', () => {
    const skillsDir = resolveProductSkillsDirectory();
    expect(skillsDir).toBeTruthy();

    const diskSlugs = readdirSync(skillsDir as string)
      .filter((entry) => {
        const skillDir = join(skillsDir as string, entry);
        return (
          statSync(skillDir).isDirectory() &&
          existsSync(join(skillDir, 'SKILL.md'))
        );
      })
      .sort();

    const definitions = loadFirstPartySkillDefinitions(skillsDir);
    expect(definitions.map((entry) => entry.slug).sort()).toEqual(diskSlugs);

    const imagePrompt = definitions.find(
      (entry) => entry.slug === 'image-prompt-engineer',
    );
    expect(imagePrompt).toMatchObject({
      id: 'cskillbuiltinimagepromptengineer',
      name: 'Image Prompt Engineer',
      slug: 'image-prompt-engineer',
      version: '1.0.0',
    });
    expect(imagePrompt?.instructions).toContain('# Image Prompt Engineer');
    expect(imagePrompt?.instructions.length).toBeGreaterThan(2000);
    expect(imagePrompt?.modalities).toContain('image');

    const geo = definitions.find(
      (entry) => entry.slug === 'content-geo-optimizer',
    );
    expect(geo?.id).toBe('cskillbuiltincontentgeo');

    for (const original of ORIGINAL_BUILT_IN_SKILL_CATALOG) {
      const match = definitions.find((entry) => entry.slug === original.slug);
      if (match) {
        expect(match.id).toBe(original.id);
      }
    }
  });

  it('appends small in-skill reference markdown when present', () => {
    const skillsDir = resolveProductSkillsDirectory();
    const brandOs = loadFirstPartySkillDefinitions(skillsDir).find(
      (entry) => entry.slug === 'brand-os-architect',
    );
    const referencePath = join(
      skillsDir as string,
      'brand-os-architect',
      'references',
      'source-pack.md',
    );

    expect(existsSync(referencePath)).toBe(true);
    expect(statSync(referencePath).size).toBeLessThanOrEqual(8000);
    expect(brandOs?.instructions).toContain('## Referenced: source-pack.md');
    expect(brandOs?.instructions).toContain(
      readFileSync(referencePath, 'utf-8').trim().slice(0, 80),
    );
  });
});
