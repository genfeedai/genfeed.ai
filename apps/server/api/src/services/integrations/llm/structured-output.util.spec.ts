import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import {
  buildStructuredResponseFormat,
  runStructuredCompletion,
  toStructuredJsonSchema,
} from '@api/services/integrations/llm/structured-output.util';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const schema = z.object({
  feedback: z.array(z.string()),
  note: z.string().nullish(),
  score: z.number().min(1).max(10),
});

describe('toStructuredJsonSchema', () => {
  it('emits a strict-compatible schema with every property required', () => {
    const jsonSchema = toStructuredJsonSchema(schema);

    expect(jsonSchema.$schema).toBeUndefined();
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.required).toEqual(['feedback', 'note', 'score']);
  });

  it('completes required on nested objects too', () => {
    const nested = z.object({
      items: z.array(
        z.object({ label: z.string(), tag: z.string().nullish() }),
      ),
    });

    const jsonSchema = toStructuredJsonSchema(nested) as {
      properties: { items: { items: { required: string[] } } };
    };

    expect(jsonSchema.properties.items.items.required).toEqual([
      'label',
      'tag',
    ]);
  });
});

describe('buildStructuredResponseFormat', () => {
  it('wraps a closed schema in a strict json_schema response format', () => {
    const plain = z.object({
      feedback: z.array(z.string()),
      score: z.number(),
    });
    const jsonSchema = toStructuredJsonSchema(plain);
    const format = buildStructuredResponseFormat('quality', jsonSchema);

    expect(format).toEqual({
      json_schema: { name: 'quality', schema: jsonSchema, strict: true },
      type: 'json_schema',
    });
  });

  it('drops strict when the schema holds an open record', () => {
    const open = z.object({
      config: z.record(z.string(), z.unknown()),
      id: z.string(),
    });

    const format = buildStructuredResponseFormat(
      'node',
      toStructuredJsonSchema(open),
    );

    // OpenAI's strict mode rejects an object with no `properties`, so the
    // schema still goes to the provider — just not as a hard constraint.
    expect(format.json_schema.strict).toBe(false);
    expect(format.json_schema.schema).toMatchObject({
      properties: { config: { type: 'object' } },
    });
  });

  it('keeps strict by dropping the bounds strict mode rejects', () => {
    const bounded = z.object({
      label: z.string().min(1),
      score: z.number().min(0).max(100),
      tags: z.array(z.string()).min(1),
      when: z.iso.datetime({ offset: true }),
    });
    const jsonSchema = toStructuredJsonSchema(bounded) as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(jsonSchema.properties.label.minLength).toBeUndefined();
    expect(jsonSchema.properties.score.minimum).toBeUndefined();
    expect(jsonSchema.properties.score.maximum).toBeUndefined();
    expect(jsonSchema.properties.tags.minItems).toBeUndefined();
    expect(jsonSchema.properties.when.format).toBeUndefined();
    expect(jsonSchema.properties.when.pattern).toBeUndefined();
    expect(
      buildStructuredResponseFormat('bounded', jsonSchema).json_schema.strict,
    ).toBe(true);
  });

  it('drops the bounds nested inside arrays and objects too', () => {
    const nested = z.object({
      items: z.array(z.object({ score: z.number().max(100) })),
    });

    const jsonSchema = toStructuredJsonSchema(nested) as {
      properties: { items: { items: { properties: { score: object } } } };
    };

    expect(jsonSchema.properties.items.items.properties.score).toEqual({
      type: 'number',
    });
  });

  it('keeps the shape strict mode does enforce', () => {
    const bounded = z.object({
      kind: z.enum(['a', 'b']),
      label: z.string().min(1),
    });

    expect(toStructuredJsonSchema(bounded)).toMatchObject({
      additionalProperties: false,
      properties: { kind: { enum: ['a', 'b'] }, label: { type: 'string' } },
      required: ['kind', 'label'],
    });
  });

  it('leaves a property literally named `pattern` alone', () => {
    const named = z.object({ pattern: z.string().min(1) });

    const jsonSchema = toStructuredJsonSchema(named) as {
      properties: Record<string, unknown>;
    };

    expect(jsonSchema.properties.pattern).toEqual({ type: 'string' });
  });

  it('still enforces the dropped bounds with zod on the way back', () => {
    const bounded = z.object({ label: z.string().min(1) });

    expect(bounded.safeParse({ label: '' }).success).toBe(false);
  });

  it('still refuses an answer the non-strict schema does not match', () => {
    const open = z.object({
      config: z.record(z.string(), z.unknown()),
      id: z.string(),
    });

    expect(open.safeParse({ config: {}, id: 7 }).success).toBe(false);
  });
});

describe('runStructuredCompletion', () => {
  it('returns validated data from a first valid attempt', async () => {
    const attempt = vi
      .fn()
      .mockResolvedValue('{"feedback":["tight hook"],"score":8}');

    const result = await runStructuredCompletion({
      attempt,
      schema,
      schemaName: 'quality',
    });

    expect(result).toEqual({ feedback: ['tight hook'], score: 8 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('repairs once and returns the corrected answer', async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce('{"feedback":["tight hook"],"score":"high"}')
      .mockResolvedValueOnce('{"feedback":["tight hook"],"score":8}');

    const result = await runStructuredCompletion({
      attempt,
      schema,
      schemaName: 'quality',
    });

    expect(result).toEqual({ feedback: ['tight hook'], score: 8 });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt.mock.calls[1][0]).toMatchObject({
      previousRaw: '{"feedback":["tight hook"],"score":"high"}',
    });
    expect(attempt.mock.calls[1][0].instruction).toContain('score');
  });

  it('throws the typed error with zod issues after the repair also fails', async () => {
    const attempt = vi.fn().mockResolvedValue('{"feedback":[],"score":"high"}');

    await expect(
      runStructuredCompletion({ attempt, schema, schemaName: 'quality' }),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('carries the failing paths on the thrown error', async () => {
    const attempt = vi.fn().mockResolvedValue('{"feedback":[],"score":"high"}');
    expect.assertions(2);

    try {
      await runStructuredCompletion({ attempt, schema, schemaName: 'quality' });
    } catch (thrown: unknown) {
      const error = thrown as LlmStructuredOutputError;
      expect(error.schemaName).toBe('quality');
      expect(error.issues.map((issue) => issue.path)).toEqual(['score']);
    }
  });

  it('treats non-JSON text as a validation failure', async () => {
    const attempt = vi.fn().mockResolvedValue('Sure! Here is the plan.');
    expect.assertions(2);

    try {
      await runStructuredCompletion({ attempt, schema, schemaName: 'quality' });
    } catch (thrown: unknown) {
      const error = thrown as LlmStructuredOutputError;
      expect(error.issues).toEqual([
        {
          code: 'invalid_format',
          message: 'Model output was not a JSON document',
          path: '<root>',
        },
      ]);
      expect(error.message).toContain('not a JSON document');
    }
  });

  it('treats empty content as a validation failure', async () => {
    const attempt = vi.fn().mockResolvedValue(null);
    expect.assertions(2);

    try {
      await runStructuredCompletion({ attempt, schema, schemaName: 'quality' });
    } catch (thrown: unknown) {
      const error = thrown as LlmStructuredOutputError;
      expect(error.issues).toEqual([
        {
          code: 'invalid_type',
          message: 'Model returned no content',
          path: '<root>',
        },
      ]);
      expect(error.message).toContain('no content');
    }
  });

  it('carries the issues to the HTTP response as data, not just prose', async () => {
    const attempt = vi.fn().mockResolvedValue('{"feedback":[],"score":"high"}');
    expect.assertions(1);

    try {
      await runStructuredCompletion({ attempt, schema, schemaName: 'quality' });
    } catch (thrown: unknown) {
      const error = thrown as LlmStructuredOutputError;
      expect(error.getResponse()).toMatchObject({
        source: { issues: error.issues, schemaName: 'quality' },
      });
    }
  });
});
