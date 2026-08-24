import { loadFirstPartySkillDefinitions } from '@api/collections/skills/catalog/first-party-skill-loader';
import { BUILT_IN_SKILL_ID_PREFIX } from '@api/collections/skills/constants/skill-catalog-identity';
import {
  BUILT_IN_SKILL_CATALOG,
  EXECUTABLE_BUILT_IN_SKILL_CATALOG,
  isBuiltInSkillIdentity,
  isExecutableBuiltInSkillIdentity,
  isReservedBuiltInSkillSlug,
  ORIGINAL_BUILT_IN_SKILL_CATALOG,
} from '@api/collections/skills/constants/skill-validation.constant';
import { describe, expect, it } from 'vitest';

describe('built-in skill catalog trust root', () => {
  it('keeps the original five identities first and executable-only', () => {
    expect(BUILT_IN_SKILL_CATALOG.slice(0, 5)).toEqual([
      ...ORIGINAL_BUILT_IN_SKILL_CATALOG,
    ]);
    expect(EXECUTABLE_BUILT_IN_SKILL_CATALOG).toEqual(
      ORIGINAL_BUILT_IN_SKILL_CATALOG,
    );
    expect(
      isExecutableBuiltInSkillIdentity(
        `${BUILT_IN_SKILL_ID_PREFIX}contentwrite`,
        'content-writing',
      ),
    ).toBe(true);
    expect(
      isExecutableBuiltInSkillIdentity(
        'cskillbuiltinimagepromptengineer',
        'image-prompt-engineer',
      ),
    ).toBe(false);
  });

  it('treats every first-party SKILL.md slug as a reserved built-in identity', () => {
    const definitions = loadFirstPartySkillDefinitions();
    expect(definitions.length).toBeGreaterThanOrEqual(30);

    for (const definition of definitions) {
      expect(isReservedBuiltInSkillSlug(definition.slug)).toBe(true);
      expect(isBuiltInSkillIdentity(definition.id, definition.slug)).toBe(true);
    }
  });
});
