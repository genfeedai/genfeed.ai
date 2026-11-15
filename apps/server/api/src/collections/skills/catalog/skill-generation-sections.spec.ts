import { resolveDefaultFirstPartySkillSlugs } from '@api/collections/skills/catalog/default-first-party-skills';
import { loadFirstPartySkillDefinitions } from '@api/collections/skills/catalog/first-party-skill-loader';
import { describe, expect, it } from 'vitest';

import {
  compileGenerationSections,
  GENERATION_SECTION_PLANS,
  generationSkillBudget,
  parseSkillSections,
} from './skill-generation-sections';

const catalog = loadFirstPartySkillDefinitions();
const instructionsOf = (slug: string): string =>
  catalog.find((definition) => definition.slug === slug)?.instructions ?? '';

describe('parseSkillSections', () => {
  it('splits at ## headings and ignores headings inside code fences', () => {
    const parsed = parseSkillSections(
      [
        '# Title',
        'Intro.',
        '## One',
        'a',
        '```',
        '## not a heading',
        '```',
        '### Child',
        'b',
        '## Two',
        'c',
      ].join('\n'),
    );
    expect(parsed.preamble).toBe('# Title\nIntro.');
    expect(parsed.sections.map((section) => section.heading)).toEqual([
      'One',
      'Two',
    ]);
    expect(parsed.sections[0].text).toContain('### Child');
    expect(parsed.sections[0].text).toContain('## not a heading');
  });
});

describe('compileGenerationSections', () => {
  const doc = [
    '# Skill',
    'Intro.',
    '## Alpha',
    'alpha text',
    '## Beta',
    'beta text mentions notes.md',
    '## Referenced: notes.md',
    'notes body',
    '## Referenced: other.md',
    'other body',
  ].join('\n');

  it('keeps sections whole in order and loads a linked file only when named', () => {
    const compiled = compileGenerationSections({
      budget: 1_000,
      instructions: doc,
    });
    expect(compiled.loaded).toEqual([
      'preamble',
      'Alpha',
      'Beta',
      'Referenced: notes.md',
    ]);
    expect(compiled.omitted).toEqual(['Referenced: other.md']);
    expect(compiled.text).not.toContain('other body');
  });

  it('drops whole sections that do not fit and never cuts mid-text', () => {
    const compiled = compileGenerationSections({
      budget: 40,
      instructions: doc,
    });
    expect(compiled.loaded).toEqual(['preamble', 'Alpha']);
    expect(compiled.text).toBe('# Skill\nIntro.\n\n## Alpha\nalpha text');
    expect(compiled.omitted).toContain('Beta');
  });

  it('returns no text when not even the intro fits', () => {
    expect(
      compileGenerationSections({ budget: 5, instructions: doc }).text,
    ).toBe('');
  });

  it('ignores a plan for a skill that is not trusted first-party', () => {
    const compiled = compileGenerationSections({
      budget: 100_000,
      instructions: instructionsOf('cinematic-prompting'),
      modality: 'video',
    });
    expect(compiled.omitted).toEqual([]);
  });
});

describe('generation section plans against the shipped catalog', () => {
  it.each(
    Object.entries(GENERATION_SECTION_PLANS).flatMap(([slug, plan]) =>
      Object.entries(plan).map(([modality, headings]) => ({
        headings: headings ?? [],
        modality,
        slug,
      })),
    ),
  )(
    '$slug lists only headings it still has for $modality',
    ({ headings, modality, slug }) => {
      const present = parseSkillSections(instructionsOf(slug)).sections.map(
        (section) => section.heading.toLowerCase(),
      );
      expect(present.length).toBeGreaterThan(0);
      for (const heading of headings) {
        expect(present).toContain(heading.toLowerCase());
      }
      const compiled = compileGenerationSections({
        budget: generationSkillBudget(modality),
        instructions: instructionsOf(slug),
        modality,
        planSlug: slug,
      });
      expect(
        compiled.loaded
          .filter((name) => name !== 'preamble')
          .map((name) => name.toLowerCase()),
      ).toEqual(headings.map((heading) => heading.toLowerCase()));
    },
  );

  it.each([
    ['audio', 12_000],
    ['image', 24_000],
    ['video', 24_000],
  ])(
    'fits every %s default skill together under %i characters, uncut',
    (modality, budget) => {
      const slugs = resolveDefaultFirstPartySkillSlugs({ modality });
      let total = 0;
      for (const slug of slugs) {
        const source = instructionsOf(slug);
        const compiled = compileGenerationSections({
          budget: budget - total,
          instructions: source,
          modality,
          planSlug: slug,
        });
        expect(compiled.text.length).toBeGreaterThan(0);
        for (const section of parseSkillSections(compiled.text).sections) {
          expect(source).toContain(section.text);
        }
        total += compiled.text.length;
      }
      expect(total).toBeLessThanOrEqual(budget);
    },
  );

  it('gives video generation camera vocabulary and no image prompt text', () => {
    const slugs = resolveDefaultFirstPartySkillSlugs({ modality: 'video' });
    const text = slugs
      .map(
        (slug) =>
          compileGenerationSections({
            budget: 24_000,
            instructions: instructionsOf(slug),
            modality: 'video',
            planSlug: slug,
          }).text,
      )
      .join('\n');
    expect(text).toContain('## Camera movement');
    expect(text).not.toContain('## Style Presets');
  });

  it('keeps the image skill under the old per-skill limit for images', () => {
    const compiled = compileGenerationSections({
      budget: 24_000,
      instructions: instructionsOf('image-prompt-engineer'),
      modality: 'image',
      planSlug: 'image-prompt-engineer',
    });
    expect(instructionsOf('image-prompt-engineer').length).toBeGreaterThan(
      24_000,
    );
    expect(compiled.text.length).toBeLessThan(18_000);
    expect(compiled.omitted).toContain('Bad vs Good Prompt Examples');
  });
});
