import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { resolveProductSkillsDirectory } from '@api/collections/skills/catalog/first-party-skill-loader';
import {
  BUILT_IN_SKILL_ID_PREFIX,
  builtInSkillIdentityForSlug,
  compactBuiltInSkillId,
  mergeBuiltInSkillCatalog,
  ORIGINAL_BUILT_IN_SKILL_CATALOG,
} from '@api/collections/skills/constants/skill-catalog-identity';
import { describe, expect, it } from 'vitest';

describe('built-in skill identity scheme', () => {
  it('keeps the original five handler identities unchanged', () => {
    expect(ORIGINAL_BUILT_IN_SKILL_CATALOG).toEqual([
      {
        id: `${BUILT_IN_SKILL_ID_PREFIX}contentgeo`,
        slug: 'content-geo-optimizer',
      },
      {
        id: `${BUILT_IN_SKILL_ID_PREFIX}contentwrite`,
        slug: 'content-writing',
      },
      {
        id: `${BUILT_IN_SKILL_ID_PREFIX}imagegenerate`,
        slug: 'image-generation',
      },
      {
        id: `${BUILT_IN_SKILL_ID_PREFIX}trenddiscover`,
        slug: 'trend-discovery',
      },
      { id: `${BUILT_IN_SKILL_ID_PREFIX}trendremix`, slug: 'trend-remix' },
    ]);
  });

  it('does not regenerate original compact ids from their slugs', () => {
    expect(compactBuiltInSkillId('content-geo-optimizer')).toBe(
      'cskillbuiltincontentgeooptimizer',
    );
    expect(builtInSkillIdentityForSlug('content-geo-optimizer').id).toBe(
      'cskillbuiltincontentgeo',
    );
    expect(builtInSkillIdentityForSlug('image-prompt-engineer').id).toBe(
      'cskillbuiltinimagepromptengineer',
    );
  });

  it('assigns unique compact ids to every first-party skill directory', () => {
    const skillsDir = resolveProductSkillsDirectory();
    expect(skillsDir).toBeTruthy();

    const slugs = readdirSync(skillsDir as string).filter((entry) => {
      const skillDir = join(skillsDir as string, entry);
      return (
        statSync(skillDir).isDirectory() &&
        existsSync(join(skillDir, 'SKILL.md'))
      );
    });

    const catalog = mergeBuiltInSkillCatalog(
      slugs.map((slug) => builtInSkillIdentityForSlug(slug)),
    );
    const ids = catalog.map((entry) => entry.id);

    expect(ids).toHaveLength(new Set(ids).size);
    expect(
      catalog.find((entry) => entry.slug === 'content-geo-optimizer')?.id,
    ).toBe('cskillbuiltincontentgeo');
  });
});
