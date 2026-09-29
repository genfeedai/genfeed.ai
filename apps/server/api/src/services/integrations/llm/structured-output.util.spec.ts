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
});

describe('buildStructuredResponseFormat', () => {
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
});
