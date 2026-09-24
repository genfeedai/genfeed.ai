import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  mergeBuiltInSkillCatalog,
  ORIGINAL_BUILT_IN_SKILL_CATALOG,
} from '@api/collections/skills/constants/skill-catalog-identity';
import { describe, expect, it } from 'vitest';

import {
  loadFirstPartySkillDefinitions,
  loadFirstPartySkillIdentities,
  resolveProductSkillsDirectory,
} from './first-party-skill-loader';

describe('first-party skill loader', () => {
  it.each([
    'missing-directory',
    'missing-lock',
    'corrupt-lock',
    'undeclared-file',
  ])(
    'fails closed without throwing during identity discovery for %s',
    (failure) => {
      const fixture = mkdtempSync(join(tmpdir(), 'catalog-identities-'));
      try {
        cpSync(resolveProductSkillsDirectory() as string, fixture, {
          recursive: true,
        });
        if (failure === 'missing-directory')
          rmSync(fixture, { recursive: true });
        else if (failure === 'missing-lock')
          rmSync(join(fixture, 'catalog.lock.json'));
        else if (failure === 'corrupt-lock')
          writeFileSync(join(fixture, 'catalog.lock.json'), '{invalid');
        else
          writeFileSync(
            join(fixture, 'ad-copy-creator', 'undeclared.md'),
            'unverified',
          );
        expect(() => loadFirstPartySkillDefinitions(fixture)).toThrow();
        expect(loadFirstPartySkillIdentities(fixture)).toEqual([]);
        expect(
          mergeBuiltInSkillCatalog(loadFirstPartySkillIdentities(fixture)),
        ).toEqual(ORIGINAL_BUILT_IN_SKILL_CATALOG);
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );

  it('reports verified local provenance and rejects tampered or missing locks', () => {
    const directory = resolveProductSkillsDirectory() as string;
    const definitions = loadFirstPartySkillDefinitions(directory);
    expect(
      definitions.find((skill) => skill.slug === 'ad-copy-creator'),
    ).toMatchObject({
      catalogOrigin: 'upstream',
      sourceRepository: 'https://github.com/genfeedai/skills',
      sourceCommit: '21bc4b59b98db27e0fe5032412ae173a7409e11b',
      sourcePath: 'ad-copy-creator',
      catalogCompilerVersion: 'legacy-v1-char-caps',
      sourcePackageHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      instructionsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      definitions.find((skill) => skill.slug === 'workflow-creator'),
    ).toMatchObject({
      catalogOrigin: 'application',
      sourceRepository: 'https://github.com/genfeedai/genfeed.ai',
      sourcePath: 'skills/workflow-creator',
    });
    const fixture = mkdtempSync(join(tmpdir(), 'catalog-loader-'));
    try {
      cpSync(directory, fixture, { recursive: true });
      writeFileSync(join(fixture, 'ad-copy-creator', 'SKILL.md'), 'tampered');
      expect(() => loadFirstPartySkillDefinitions(fixture)).toThrow(
        'integrity',
      );
      rmSync(join(fixture, 'catalog.lock.json'));
      expect(() => loadFirstPartySkillDefinitions(fixture)).toThrow();
      expect(
        loadFirstPartySkillDefinitions(fixture, { allowLegacyFixture: true })[0]
          .catalogOrigin,
      ).toBeUndefined();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

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
