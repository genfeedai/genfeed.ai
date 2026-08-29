import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';

export type ObjectSchemaProperties = Readonly<Record<string, ActionJsonSchema>>;

export const STRING_SCHEMA = { type: 'string' } as const;
export const NON_EMPTY_STRING_SCHEMA = {
  minLength: 1,
  type: 'string',
} as const;
export const NUMBER_SCHEMA = { type: 'number' } as const;
export const INTEGER_SCHEMA = { type: 'integer' } as const;
export const BOOLEAN_SCHEMA = { type: 'boolean' } as const;
export const NULL_SCHEMA = { type: 'null' } as const;

export function enumSchema<const T extends readonly string[]>(values: T) {
  return { enum: values, type: 'string' } as const;
}

export function arraySchema(items: ActionJsonSchema) {
  return { items, type: 'array' } as const;
}

export function closedObjectSchema(
  properties: ObjectSchemaProperties,
  required: readonly string[] = [],
): ActionJsonSchema {
  return {
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required: [...required] } : {}),
    type: 'object',
  };
}

export function nullableSchema(schema: ActionJsonSchema): ActionJsonSchema {
  return { anyOf: [schema, NULL_SCHEMA] };
}

/**
 * Marker for an explicitly opaque JSON document boundary. The marker is
 * materialized into a root-owned recursive definition before publication so
 * nested values have no artificial depth limit and still reject `undefined`.
 */
export const JSON_DOCUMENT_SCHEMA = {
  $comment: 'genfeed:recursive-json-document',
} as const;

const JSON_VALUE_REFERENCE = { $ref: '#/$defs/jsonValue' } as const;
const JSON_VALUE_DEFINITION: ActionJsonSchema = {
  anyOf: [
    NULL_SCHEMA,
    BOOLEAN_SCHEMA,
    NUMBER_SCHEMA,
    STRING_SCHEMA,
    { items: JSON_VALUE_REFERENCE, type: 'array' },
    {
      additionalProperties: JSON_VALUE_REFERENCE,
      type: 'object',
    },
  ],
};

export function materializeJsonDocumentSchema(
  schema: ActionJsonSchema,
): ActionJsonSchema {
  let usedJsonDocument = false;

  const visit = (candidate: unknown): unknown => {
    if (candidate === JSON_DOCUMENT_SCHEMA) {
      usedJsonDocument = true;
      return JSON_VALUE_REFERENCE;
    }
    if (Array.isArray(candidate)) return candidate.map(visit);
    if (!isSchemaRecord(candidate)) return candidate;
    return Object.fromEntries(
      Object.entries(candidate).map(([key, value]) => [key, visit(value)]),
    );
  };

  const materialized = visit(schema) as Record<string, unknown>;
  if (!usedJsonDocument) return materialized;
  const existingDefs = isSchemaRecord(materialized.$defs)
    ? materialized.$defs
    : {};
  return {
    ...materialized,
    $defs: { ...existingDefs, jsonValue: JSON_VALUE_DEFINITION },
  };
}

export const STRING_MAP_SCHEMA: ActionJsonSchema = {
  additionalProperties: STRING_SCHEMA,
  type: 'object',
};

export function closeObjectSchemas(schema: ActionJsonSchema): ActionJsonSchema {
  const closed = { ...schema } as Record<string, unknown>;
  for (const keyword of [
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
    'dependentSchemas',
  ]) {
    const candidates = closed[keyword];
    if (isSchemaRecord(candidates)) {
      closed[keyword] = Object.fromEntries(
        Object.entries(candidates).map(([key, candidate]) => [
          key,
          closeObjectSchemas(candidate),
        ]),
      );
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    const candidates = closed[keyword];
    if (Array.isArray(candidates)) {
      closed[keyword] = candidates.map((candidate) =>
        isSchemaRecord(candidate) ? closeObjectSchemas(candidate) : candidate,
      );
    }
  }
  for (const keyword of [
    'additionalProperties',
    'contains',
    'else',
    'if',
    'items',
    'not',
    'then',
  ]) {
    const candidate = closed[keyword];
    if (isSchemaRecord(candidate)) {
      closed[keyword] = closeObjectSchemas(candidate);
    }
  }
  if (
    declaresObjectSchema(closed) &&
    closed.additionalProperties === undefined
  ) {
    closed.additionalProperties = false;
  }
  return closed;
}

function isSchemaRecord(value: unknown): value is ActionJsonSchema {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function declaresObjectSchema(schema: ActionJsonSchema): boolean {
  const type = (schema as { type?: unknown }).type;
  return type === 'object' || (Array.isArray(type) && type.includes('object'));
}
