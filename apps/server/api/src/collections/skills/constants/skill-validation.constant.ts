import { loadFirstPartySkillIdentities } from '@api/collections/skills/catalog/first-party-skill-loader';
import {
  type BuiltInSkillIdentity,
  mergeBuiltInSkillCatalog,
  ORIGINAL_BUILT_IN_SKILL_CATALOG,
} from '@api/collections/skills/constants/skill-catalog-identity';

export const MAX_CONFIGURED_SKILL_SLUGS = 100;
export const MAX_SKILL_SLUG_LENGTH = 160;

export type { BuiltInSkillIdentity } from '@api/collections/skills/constants/skill-catalog-identity';
export {
  BUILT_IN_SKILL_ID_PREFIX,
  builtInSkillIdentityForSlug,
  compactBuiltInSkillId,
  isOriginalBuiltInSkillSlug,
  ORIGINAL_BUILT_IN_SKILL_CATALOG,
} from '@api/collections/skills/constants/skill-catalog-identity';

/**
 * Global skill rows are readable by every tenant, so null ownership and
 * caller-controlled config flags are not sufficient provenance. These stable
 * migration-owned id/slug pairs are the complete server trust root for the
 * executable built-in catalog (original five handlers) plus first-party
 * product skills discovered from each skills directory SKILL.md.
 *
 * The original five identities stay first and keep their historical ids.
 */
export const BUILT_IN_SKILL_CATALOG: readonly BuiltInSkillIdentity[] =
  mergeBuiltInSkillCatalog(loadFirstPartySkillIdentities());

export const EXECUTABLE_BUILT_IN_SKILL_CATALOG =
  ORIGINAL_BUILT_IN_SKILL_CATALOG;

export function isBuiltInSkillIdentity(id: unknown, slug: unknown): boolean {
  return BUILT_IN_SKILL_CATALOG.some(
    (entry) => entry.id === id && entry.slug === slug,
  );
}

export function isExecutableBuiltInSkillIdentity(
  id: unknown,
  slug: unknown,
): boolean {
  return EXECUTABLE_BUILT_IN_SKILL_CATALOG.some(
    (entry) => entry.id === id && entry.slug === slug,
  );
}

export function isReservedBuiltInSkillSlug(slug: unknown): boolean {
  return BUILT_IN_SKILL_CATALOG.some((entry) => entry.slug === slug);
}

export function isTrustedProductSkill(skill: {
  isBuiltIn?: boolean;
  source?: string;
}): boolean {
  return skill.isBuiltIn === true && skill.source === 'built_in';
}
