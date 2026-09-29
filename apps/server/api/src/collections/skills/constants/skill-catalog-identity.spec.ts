import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { resolveProductSkillsDirectory } from '@api/collections/skills/catalog/first-party-skill-loader';
import {
  builtInSkillIdentityForSlug,
  compactBuiltInSkillId,
  mergeBuiltInSkillCatalog,
} from '@api/collections/skills/constants/skill-catalog-identity';
import { describe, expect, it } from 'vitest';

describe('built-in skill identity scheme', () => {
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
