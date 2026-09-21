import type { ZodType } from 'zod';

/**
 * Parameters for {@link ReplicateService.generateStructuredTextSync}.
 *
 * `prompt` is kept out of `input` so the repair turn can rewrite it without
 * disturbing the model's other knobs (token budget, temperature, …).
 */
export interface ReplicateStructuredTextParams<TResult> {
  /** Everything but the prompt — token budget and model-specific knobs. */
  input: Record<string, unknown>;
  /** Fires after every model call, first attempt and repair alike, for billing. */
  onAttempt?: (
    input: Record<string, unknown>,
    output: string,
  ) => Promise<void> | void;
  /** The prompt for the first attempt; the repair turn appends to it. */
  prompt: string;
  /** Zod schema the model output is validated against. */
  schema: ZodType<TResult>;
  /** Stable schema name reported in failures. */
  schemaName: string;
}
