/**
 * Validation failure detail carried by schema-enforced LLM completions.
 *
 * A serializable projection of a zod issue: the raw zod issue object is not
 * safe to put on an HTTP response (it carries the received value, which can be
 * tenant content), so only the locator, code and message cross the boundary.
 */
export interface ILlmStructuredOutputIssue {
  /** Dot/bracket path to the offending field, `<root>` when the whole value failed. */
  path: string;
  /** Zod issue code, e.g. `invalid_type`, `invalid_value`, `too_small`. */
  code: string;
  /** Human-readable explanation, safe to send back to the model for repair. */
  message: string;
}
