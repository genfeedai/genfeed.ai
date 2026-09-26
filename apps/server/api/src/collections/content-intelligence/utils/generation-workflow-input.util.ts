import type { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';

function dropUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => dropUndefined(item));
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, dropUndefined(entry)]),
  );
}

/**
 * The content-intelligence workflow takes its DTO as a JSON document, and an
 * `undefined` property is not a JSON value: the action contract rejects the
 * whole input. Nest's `plainToInstance` and optional tool parameters both
 * leave such keys behind, so drop them (recursively) at the workflow boundary.
 */
export function toGenerationWorkflowDto(
  dto: GenerateContentDto,
): GenerateContentDto {
  return dropUndefined(dto) as GenerateContentDto;
}
