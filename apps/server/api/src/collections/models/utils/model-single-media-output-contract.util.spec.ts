import { interpretSingleMediaOutputContract as interpret } from '@api/collections/models/utils/model-single-media-output-contract.util';
import { describe, expect, it } from 'vitest';

const uri = { type: 'string', format: 'uri' };
const array = { type: 'array', items: uri };
const inputSchema = {
  type: 'object',
  properties: {
    num_outputs: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
  },
};
const annotated = { ...array, 'x-genfeed-output-count-input': 'num_outputs' };

describe('single primary media output contract interpreter', () => {
  it('supports a scalar URI and explicitly singleton-bounded URI array', () => {
    expect(interpret(uri, {}, {})).toEqual({
      status: 'supported',
      contract: {
        adapterVersion: 1,
        representation: 'uri',
        requests: 1,
        outputs: 1,
      },
    });
    expect(
      interpret({ ...array, minItems: 1, maxItems: 1 }, {}, {}),
    ).toMatchObject({
      status: 'supported',
      contract: { representation: 'uri-array' },
    });
  });
  it('does not promote a compiler count or input schema default into an unstored relationship', () => {
    expect(interpret(array, inputSchema, { num_outputs: 1 })).toEqual({
      status: 'unresolved',
      reason: 'output_cardinality_unverified',
    });
    expect(interpret(annotated, inputSchema, {})).toEqual({
      status: 'unresolved',
      reason: 'output_count_unverified',
    });
  });
  it('honors an explicit reviewed top-level count annotation only for the final count of one', () => {
    expect(interpret(annotated, inputSchema, { num_outputs: 1 })).toEqual({
      status: 'supported',
      contract: {
        adapterVersion: 1,
        representation: 'uri-array',
        requests: 1,
        outputs: 1,
        countInput: 'num_outputs',
      },
    });
  });
  it.each([0, 2, -1, 1.5, '1', null, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects final count %s',
    (count) => {
      expect(
        interpret(annotated, inputSchema, { num_outputs: count }).status,
      ).toBe('unresolved');
    },
  );
  it.each([
    { $ref: '#/components/schemas/Output' },
    { oneOf: [uri, array] },
    { ...uri, nullable: true },
    { type: 'string' },
    { type: ['string', 'null'], format: 'uri' },
    { type: 'object', properties: { image: uri } },
    {
      ...array,
      items: { $ref: '#/components/schemas/Uri' },
      minItems: 1,
      maxItems: 1,
    },
    { ...array, items: { type: 'string' }, minItems: 1, maxItems: 1 },
    { ...array, minItems: 0, maxItems: 1 },
    { ...array, minItems: 1 },
    { ...annotated, minItems: 2 },
    { ...annotated, maxItems: 0 },
    { ...annotated, minItems: '1' },
    { ...annotated, maxItems: 1.5 },
    { ...annotated, anyOf: [array] },
    { ...annotated, contains: uri },
    { ...uri, 'x-genfeed-output-count-input': 'num_outputs' },
  ])('rejects unsupported or contradictory output schemas %#', (schema) => {
    expect(interpret(schema, inputSchema, { num_outputs: 1 }).status).toBe(
      'unresolved',
    );
  });
  it.each(['', ' num_outputs ', 1, {}, null])(
    'rejects malformed stored count annotations %#',
    (annotation) => {
      expect(
        interpret(
          { ...array, 'x-genfeed-output-count-input': annotation },
          inputSchema,
          { num_outputs: 1 },
        ).status,
      ).toBe('unresolved');
    },
  );
  it.each([
    { type: 'number' },
    { type: 'integer', minimum: 2 },
    { type: 'integer', maximum: 0 },
    { type: 'integer', exclusiveMinimum: 1 },
    { type: 'integer', exclusiveMaximum: 1 },
    { type: 'integer', multipleOf: 2 },
    { type: 'integer', enum: [2] },
    { type: 'integer', const: 2 },
    { type: 'integer', minimum: '1' },
    { type: 'integer', $ref: '#/components/schemas/Count' },
    { type: 'integer', oneOf: [{ const: 1 }] },
  ])('enforces declared input-count constraints %#', (countSchema) => {
    expect(
      interpret(
        annotated,
        { type: 'object', properties: { num_outputs: countSchema } },
        { num_outputs: 1 },
      ).status,
    ).toBe('unresolved');
  });
  it('does not accept an inherited count property or unresolved input composition', () => {
    const inherited: Record<string, unknown> = Object.create({
      num_outputs: 1,
    });
    expect(interpret(annotated, inputSchema, inherited).status).toBe(
      'unresolved',
    );
    expect(
      interpret(
        annotated,
        { ...inputSchema, allOf: [inputSchema] },
        { num_outputs: 1 },
      ).status,
    ).toBe('unresolved');
  });
});
