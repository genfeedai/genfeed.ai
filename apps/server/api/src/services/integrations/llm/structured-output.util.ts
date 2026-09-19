import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import type {
  OpenRouterJsonSchemaSpec,
  OpenRouterResponseFormat,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { ILlmStructuredOutputIssue } from '@genfeedai/contracts/interfaces';
import { type ZodType, z } from 'zod';

/**
 * Runs one model call. Receives the repair instruction on the second (and
 * final) attempt, and the raw text the model produced on the first, so a
 * provider adapter can append both to its own message list.
 */
export type StructuredCompletionAttempt = (repair?: {
  instruction: string;
  previousRaw: string;
}) => Promise<string | null>;

export interface RunStructuredCompletionParams<TResult> {
  attempt: StructuredCompletionAttempt;
  schema: ZodType<TResult>;
  schemaName: string;
}

/**
 * JSON Schema every route is given for a structured completion.
 *
 * `z.toJSONSchema` leaves `.nullish()` fields out of `required`, which OpenAI's
 * strict structured outputs reject. Completing `required` keeps the emitted
 * schema strict-compatible while the zod schema still accepts an omitted key
 * from a route that cannot enforce anything (Replicate, a self-hosted vLLM
 * build without guided decoding).
 */
export function toStructuredJsonSchema(
  schema: ZodType<unknown>,
): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'output',
    target: 'draft-2020-12',
    unrepresentable: 'any',
  }) as Record<string, unknown>;

  delete jsonSchema.$schema;

  return requireAllProperties(jsonSchema) as Record<string, unknown>;
}

function requireAllProperties(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(requireAllProperties);
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const record = node as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    next[key] = requireAllProperties(value);
  }

  const properties = next.properties;
  if (next.type === 'object' && isRecord(properties)) {
    next.required = Object.keys(properties);
    next.additionalProperties = false;
  }

  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildStructuredResponseFormat(
  schemaName: string,
  jsonSchema: Record<string, unknown>,
): OpenRouterResponseFormat {
  const spec: OpenRouterJsonSchemaSpec = {
    name: schemaName,
    schema: jsonSchema,
    strict: true,
  };

  return { json_schema: spec, type: 'json_schema' };
}

export function toStructuredOutputIssues(
  error: z.ZodError,
): ILlmStructuredOutputIssue[] {
  return error.issues.map((issue) => ({
    code: String(issue.code),
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join('.') : '<root>',
  }));
}

/**
 * The repair turn. Names every failing field so the second attempt is a
 * correction rather than a re-roll of the same prompt.
 */
export function buildRepairInstruction(
  schemaName: string,
  issues: ILlmStructuredOutputIssue[],
): string {
  const lines = issues.map(
    (issue) => `- ${issue.path}: ${issue.message} (${issue.code})`,
  );

  return [
    `Your previous answer did not match the "${schemaName}" schema.`,
    'Fix exactly these problems and return the corrected object:',
    ...lines,
  ].join('\n');
}

/**
 * Validate one structured attempt. Empty content is a validation failure, not
 * a transport error — a route that silently returned nothing gets the same
 * repair turn as one that returned the wrong shape.
 */
function validateAttempt<TResult>(
  schema: ZodType<TResult>,
  raw: string | null,
):
  | { isValid: true; value: TResult }
  | { isValid: false; issues: ILlmStructuredOutputIssue[] } {
  const trimmed = raw?.trim() ?? '';

  if (!trimmed) {
    return {
      isValid: false,
      issues: [
        {
          code: 'invalid_type',
          message: 'Model returned no content',
          path: '<root>',
        },
      ],
    };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(trimmed);
  } catch {
    return {
      isValid: false,
      issues: [
        {
          code: 'invalid_format',
          message: 'Model output was not a JSON document',
          path: '<root>',
        },
      ],
    };
  }

  const result = schema.safeParse(decoded);
  if (result.success) {
    return { isValid: true, value: result.data };
  }

  return { isValid: false, issues: toStructuredOutputIssues(result.error) };
}

/**
 * One attempt, one repair retry, then a typed throw. Shared by every route so
 * a provider that cannot enforce a schema degrades to validate-and-repair
 * rather than to a silent coercion or a canned fallback.
 */
export async function runStructuredCompletion<TResult>({
  attempt,
  schema,
  schemaName,
}: RunStructuredCompletionParams<TResult>): Promise<TResult> {
  const firstRaw = await attempt();
  const first = validateAttempt(schema, firstRaw);

  if (first.isValid) {
    return first.value;
  }

  const secondRaw = await attempt({
    instruction: buildRepairInstruction(schemaName, first.issues),
    previousRaw: firstRaw ?? '',
  });
  const second = validateAttempt(schema, secondRaw);

  if (second.isValid) {
    return second.value;
  }

  throw new LlmStructuredOutputError(schemaName, second.issues);
}
