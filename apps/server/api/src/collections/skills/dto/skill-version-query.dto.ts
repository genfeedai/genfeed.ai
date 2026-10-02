import type { SkillVersionListQueryV1 } from '@genfeedai/contracts/interfaces/ai/skill-version-read.interface';
import { BadRequestException } from '@nestjs/common';

function strictQuery(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Invalid skill version query');
  }
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => !allowed.includes(key))) {
    throw new BadRequestException('Unknown skill version query field');
  }
  return query;
}
function positiveInteger(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))
  ) {
    throw new BadRequestException('Expected a positive integer');
  }
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new BadRequestException('Skill version query is out of range');
  }
  return result;
}
/** Parse the untouched query (Object metatype), before whitelist/coercion can lose evidence. */
export class SkillVersionListQueryDto implements SkillVersionListQueryV1 {
  limit = 20;
  declare beforeVersionNumber?: number;

  static parse(value: unknown): SkillVersionListQueryDto {
    const query = strictQuery(value, ['limit', 'beforeVersionNumber']);
    const parsed = new SkillVersionListQueryDto();
    if (Object.hasOwn(query, 'limit'))
      parsed.limit = positiveInteger(query.limit, 50);
    if (Object.hasOwn(query, 'beforeVersionNumber')) {
      parsed.beforeVersionNumber = positiveInteger(
        query.beforeVersionNumber,
        2147483647,
      );
    }
    return parsed;
  }
}
export function parseSkillVersionEmptyQueryV1(value: unknown): void {
  strictQuery(value, []);
}
