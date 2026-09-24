import { BadRequestException } from '@nestjs/common';

export const MAX_REQUESTED_SKILL_SLUGS = 8;
export const MAX_REQUESTED_SKILL_SLUG_LENGTH = 160;
export const REQUESTED_SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

export function normalizeRequestedSkillSlugs(
  value: unknown,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > MAX_REQUESTED_SKILL_SLUGS ||
    !value.every(
      (slug): slug is string =>
        typeof slug === 'string' &&
        slug.length <= MAX_REQUESTED_SKILL_SLUG_LENGTH &&
        REQUESTED_SKILL_SLUG_PATTERN.test(slug),
    )
  ) {
    throw new BadRequestException(
      'Select up to 8 valid skills, or remove the invalid selection.',
    );
  }
  const slugs = [...new Set(value.map((slug) => slug.toLowerCase()))];
  return slugs.length ? slugs : undefined;
}

export function mergeRequestedSkillSlugs(
  context: unknown,
  input: unknown,
): string[] | undefined {
  return normalizeRequestedSkillSlugs([
    ...new Set([
      ...(normalizeRequestedSkillSlugs(context) ?? []),
      ...(normalizeRequestedSkillSlugs(input) ?? []),
    ]),
  ]);
}

export function unavailableRequestedSkill(): BadRequestException {
  return new BadRequestException(
    'A selected skill is unavailable for this generation. Choose an enabled, compatible skill or remove the selection.',
  );
}
