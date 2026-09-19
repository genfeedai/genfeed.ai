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
    const jsonSchema = toStructuredJsonSchema(schema);
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

    await expect(
      runStructuredCompletion({ attempt, schema, schemaName: 'quality' }),
    ).rejects.toThrow(/not a JSON document/);
  });

  it('treats empty content as a validation failure', async () => {
    const attempt = vi.fn().mockResolvedValue(null);

    await expect(
      runStructuredCompletion({ attempt, schema, schemaName: 'quality' }),
    ).rejects.toThrow(/no content/);
  });
});
