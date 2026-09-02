import { ModelCategory } from '@genfeedai/enums';

export interface ReplicateJsonSchema extends Record<string, unknown> {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  type?: string;
}

export interface ReplicateEndpointSchemas {
  input: ReplicateJsonSchema;
  output: ReplicateJsonSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asSchema(value: unknown): ReplicateJsonSchema {
  if (!isRecord(value)) {
    throw new Error('Replicate OpenAPI contract is missing a JSON schema');
  }
  return value as ReplicateJsonSchema;
}

export function extractReplicateEndpointSchemas(
  openapi: Record<string, unknown>,
): ReplicateEndpointSchemas {
  if (!isRecord(openapi.components) || !isRecord(openapi.components.schemas)) {
    throw new Error('Replicate OpenAPI contract is missing component schemas');
  }

  const schemas = openapi.components.schemas;
  return {
    input: asSchema(schemas.Input ?? schemas.input),
    output: asSchema(schemas.Output ?? schemas.output),
  };
}

export function classifyReplicateSchemaFamily(
  category: ModelCategory,
  input: ReplicateJsonSchema,
  output: ReplicateJsonSchema,
): string | null {
  const hasInputShape =
    input.type === 'object' ||
    (isRecord(input.properties) && Object.keys(input.properties).length > 0);
  if (!hasInputShape || Object.keys(output).length === 0) {
    return null;
  }
  return `replicate-${category}-v1`;
}

export function isReplicateSchemaFamilyCompatible(
  category: string,
  schemaFamily: string,
): boolean {
  return schemaFamily === `replicate-${category}-v1`;
}
