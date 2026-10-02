import type { SkillDraft } from '@props/settings/skills.props';
import { describe, expect, it } from 'vitest';
import { prepareSkillDraftPatch } from './skill-draft-patch';

const original: SkillDraft = {
  name: 'Name',
  description: 'Description',
  defaultInstructions: 'x'.repeat(17000),
  systemPromptTemplate: 'y'.repeat(17000),
};
describe('prepareSkillDraftPatch', () => {
  it('omits unchanged oversized instructions and preserves exact whitespace and empty clearing', () => {
    expect(
      prepareSkillDraftPatch(original, {
        ...original,
        name: ' Name ',
        description: '',
      }),
    ).toEqual({
      patch: { name: ' Name ', description: '' },
      errors: [],
      hasChanges: true,
    });
  });
  it('recognizes no-op and reverting a draft', () => {
    expect(prepareSkillDraftPatch(original, { ...original })).toEqual({
      patch: {},
      errors: [],
      hasChanges: false,
    });
  });
  it.each([
    ['name', 140],
    ['description', 2000],
    ['defaultInstructions', 8000],
    ['systemPromptTemplate', 16000],
  ] as const)(
    'validates changed %s at the backend Unicode boundary %i',
    (field, maximum) => {
      const boundary = '😀'.repeat(maximum);
      expect(
        prepareSkillDraftPatch(original, { ...original, [field]: boundary })
          .errors,
      ).toEqual([]);
      expect(
        prepareSkillDraftPatch(original, {
          ...original,
          [field]: `${boundary}a`,
        }).errors,
      ).toEqual([{ field, maximum }]);
      const presentation = '✈️'.repeat(maximum);
      expect(
        prepareSkillDraftPatch(original, { ...original, [field]: presentation })
          .errors,
      ).toEqual([]);
    },
  );
  it('retains invalid changed text in the patch rather than truncating it', () => {
    const name = 'a'.repeat(141);
    expect(
      prepareSkillDraftPatch(original, { ...original, name }).patch.name,
    ).toBe(name);
  });
});
