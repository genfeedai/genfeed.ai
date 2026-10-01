import type { SingleMediaOutputContractResult } from '@api/collections/models/utils/model-provider-output-contract.interface';
import { isRecord } from '@libs/utils/provider-contract.util';

const UNSUPPORTED_COMPOSITION = [
  '$ref',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'prefixItems',
  'contains',
  'dependentSchemas',
];
function simple(schema: Record<string, unknown>): boolean {
  return (
    !UNSUPPORTED_COMPOSITION.some((key) => key in schema) &&
    schema.nullable !== true
  );
}
function uri(schema: unknown): boolean {
  return (
    isRecord(schema) &&
    simple(schema) &&
    schema.type === 'string' &&
    schema.format === 'uri'
  );
}
function unresolved(reason: string): SingleMediaOutputContractResult {
  return { status: 'unresolved', reason };
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function admitsCount(schema: Record<string, unknown>, count: number): boolean {
  for (const key of [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
  ]) {
    const bound = schema[key];
    if (
      bound !== undefined &&
      (typeof bound !== 'number' || !Number.isFinite(bound))
    )
      return false;
  }
  if (typeof schema.minimum === 'number' && count < schema.minimum)
    return false;
  if (typeof schema.maximum === 'number' && count > schema.maximum)
    return false;
  if (
    typeof schema.exclusiveMinimum === 'number' &&
    count <= schema.exclusiveMinimum
  )
    return false;
  if (
    typeof schema.exclusiveMaximum === 'number' &&
    count >= schema.exclusiveMaximum
  )
    return false;
  if (
    typeof schema.multipleOf === 'number' &&
    (schema.multipleOf <= 0 || count % schema.multipleOf !== 0)
  )
    return false;
  if ('const' in schema && schema.const !== count) return false;
  if (
    'enum' in schema &&
    (!Array.isArray(schema.enum) || !schema.enum.includes(count))
  )
    return false;
  return true;
}

/** This shape proof requires an approved exact snapshot at the caller; it never approves pricing. */
export function interpretSingleMediaOutputContract(
  outputSchema: unknown,
  inputSchema: unknown,
  providerInput: Readonly<Record<string, unknown>>,
): SingleMediaOutputContractResult {
  if (!isRecord(outputSchema) || !simple(outputSchema))
    return unresolved('unsupported_output_schema');
  const annotation = outputSchema['x-genfeed-output-count-input'];
  if (outputSchema.type === 'string') {
    if (annotation !== undefined || !uri(outputSchema))
      return unresolved('unsupported_output_schema');
    return {
      status: 'supported',
      contract: {
        adapterVersion: 1,
        representation: 'uri',
        requests: 1,
        outputs: 1,
      },
    };
  }
  if (outputSchema.type !== 'array' || !uri(outputSchema.items))
    return unresolved('unsupported_output_schema');
  for (const key of ['minItems', 'maxItems']) {
    const bound = outputSchema[key];
    if (
      bound !== undefined &&
      (typeof bound !== 'number' || !Number.isSafeInteger(bound) || bound < 0)
    )
      return unresolved('invalid_output_cardinality');
  }
  if (
    (typeof outputSchema.minItems === 'number' && outputSchema.minItems > 1) ||
    (typeof outputSchema.maxItems === 'number' && outputSchema.maxItems < 1)
  )
    return unresolved('conflicting_output_cardinality');
  if (annotation === undefined) {
    if (outputSchema.minItems !== 1 || outputSchema.maxItems !== 1)
      return unresolved('output_cardinality_unverified');
    return {
      status: 'supported',
      contract: {
        adapterVersion: 1,
        representation: 'uri-array',
        requests: 1,
        outputs: 1,
      },
    };
  }
  // Application-owned reviewed convention: this top-level input explicitly gives
  // the number of primary output artifacts for one provider request. Defaults
  // and a compiler-supplied count alone do not establish this relationship.
  if (
    typeof annotation !== 'string' ||
    !annotation.trim() ||
    annotation !== annotation.trim() ||
    !isRecord(inputSchema) ||
    !simple(inputSchema) ||
    inputSchema.type !== 'object' ||
    !isRecord(inputSchema.properties) ||
    !Object.hasOwn(inputSchema.properties, annotation)
  )
    return unresolved('invalid_output_count_mapping');
  const countSchema = inputSchema.properties[annotation];
  const count = Object.hasOwn(providerInput, annotation)
    ? providerInput[annotation]
    : undefined;
  if (
    !isRecord(countSchema) ||
    !simple(countSchema) ||
    countSchema.type !== 'integer' ||
    !positiveInteger(count) ||
    count !== 1 ||
    !admitsCount(countSchema, count)
  )
    return unresolved('output_count_unverified');
  return {
    status: 'supported',
    contract: {
      adapterVersion: 1,
      representation: 'uri-array',
      requests: 1,
      outputs: 1,
      countInput: annotation,
    },
  };
}
