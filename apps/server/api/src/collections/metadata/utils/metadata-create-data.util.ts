import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';

const METADATA_SCALAR_FIELDS = [
  'assistant',
  'description',
  'duration',
  'error',
  'extension',
  'externalId',
  'externalProvider',
  'fps',
  'hasAudio',
  'height',
  'label',
  'model',
  'promptTemplate',
  'resolution',
  'result',
  'seed',
  'size',
  'style',
  'templateVersion',
  'width',
] as const;

function toIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && isEntityId(entry),
      )
    : [];
}

export function toMetadataCreateData(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    ...pickDefinedFields(input, METADATA_SCALAR_FIELDS),
  };
  const promptId = isEntityId(input.promptId)
    ? input.promptId.trim()
    : undefined;

  if (promptId) {
    data.promptId = promptId;
  }

  const tagIds = Array.from(new Set(toIds(input.tags)));
  if (tagIds.length > 0) {
    data.tags = { connect: tagIds.map((id) => ({ id })) };
  }

  return data;
}
