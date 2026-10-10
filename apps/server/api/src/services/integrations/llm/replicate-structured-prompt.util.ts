import { toStructuredJsonSchema } from '@api/services/integrations/llm/structured-output.util';
import type { ZodType } from 'zod';

/** The exact first-attempt prompt used by normal Replicate structured completion and its quote. */
export function buildReplicateStructuredPrompt(
  prompt: string,
  schema: ZodType<unknown>,
  schemaName: string,
): string {
  return [
    prompt,
    `Answer with a single JSON document matching this JSON Schema named "${schemaName}":`,
    JSON.stringify(toStructuredJsonSchema(schema)),
  ].join('\n\n');
}
