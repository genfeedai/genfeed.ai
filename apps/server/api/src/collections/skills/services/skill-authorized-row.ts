import { crossOrgUnsafe } from '@libs/prisma/tenant-context';

/**
 * Personal and system skills have no organization, and a granted skill can
 * belong to another one, so a skill addressed by primary key (or by its owner)
 * has no tenant the CLOUD guard can prove. Every caller authorizes the row with
 * the live capability decision or an ownership clause in the same query; this
 * is the single place the skill-row hatch is opened.
 */
export function runOnAuthorizedSkillRow<T>(run: () => Promise<T>): Promise<T> {
  return crossOrgUnsafe(async () => await run());
}
