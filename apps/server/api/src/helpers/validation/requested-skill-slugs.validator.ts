import {
  MAX_REQUESTED_SKILL_SLUG_LENGTH,
  MAX_REQUESTED_SKILL_SLUGS,
  REQUESTED_SKILL_SLUG_PATTERN,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Skill slugs picked from the composer `/` palette: omittable, but a present
 * value (including `null`) must be an array of at most eight valid slugs.
 */
export function IsRequestedSkillSlugs(): PropertyDecorator {
  return applyDecorators(
    ValidateIf((_object, value: unknown) => value !== undefined),
    IsArray(),
    ArrayMaxSize(MAX_REQUESTED_SKILL_SLUGS),
    IsString({ each: true }),
    MaxLength(MAX_REQUESTED_SKILL_SLUG_LENGTH, { each: true }),
    Matches(REQUESTED_SKILL_SLUG_PATTERN, { each: true }),
  );
}
