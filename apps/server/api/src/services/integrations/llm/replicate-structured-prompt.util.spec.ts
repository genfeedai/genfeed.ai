import { buildReplicateStructuredPrompt } from '@api/services/integrations/llm/replicate-structured-prompt.util';
import { toStructuredJsonSchema } from '@api/services/integrations/llm/structured-output.util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('shared Replicate structured prompt', () => {
  it('preserves the actual provider prompt including its complete strict schema', () => {
    const schema = z.object({
      score: z.number(),
      optional: z.string().optional(),
    });
    const expected = [
      'Actual prompt',
      'Answer with a single JSON document matching this JSON Schema named "analysis":',
      JSON.stringify(toStructuredJsonSchema(schema)),
    ].join('\n\n');
    expect(
      buildReplicateStructuredPrompt('Actual prompt', schema, 'analysis'),
    ).toBe(expected);
    expect(expected.length).toBeGreaterThan('Actual prompt'.length);
  });
});
