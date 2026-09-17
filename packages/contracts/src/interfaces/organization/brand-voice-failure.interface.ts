/**
 * Stable, actionable causes for a failed
 * `POST /v1/brands/:id/agent-config/generate-voice`.
 *
 * Each value is returned verbatim as the JSON:API error `code`, so a client
 * branches on the cause instead of parsing prose — and the sentence a user
 * reads stays in the app's own message catalog rather than arriving as
 * server English that cannot be translated.
 */
export const BrandVoiceFailureCode = {
  /** The organization-scoped brand lookup found nothing to generate from. */
  BRAND_NOT_FOUND: 'brand_not_found',
  /** The model returned nothing at all. */
  EMPTY_OUTPUT: 'empty_output',
  /** The model returned a profile without the fields personalization needs. */
  INCOMPLETE_PROFILE: 'incomplete_profile',
  /** The model's response was not parseable JSON. */
  MALFORMED_OUTPUT: 'malformed_output',
  /** Neither a website URL nor a stored brand was supplied to generate from. */
  SOURCE_REQUIRED: 'source_required',
  /** The supplied website URL is not one the scraper accepts. */
  SOURCE_URL_INVALID: 'source_url_invalid',
  /** The model returned parseable JSON that was not a profile object. */
  UNEXPECTED_OUTPUT_SHAPE: 'unexpected_output_shape',
} as const;

export type BrandVoiceFailureCode =
  (typeof BrandVoiceFailureCode)[keyof typeof BrandVoiceFailureCode];

/**
 * Carried in the JSON:API error `meta`. A model that returned unusable output
 * may well succeed on the next attempt; a rejected input will not until the
 * caller changes it.
 */
export interface IBrandVoiceFailureMeta {
  isRetryable: boolean;
}

/** JSON:API error member emitted for a classified brand voice failure. */
export interface IBrandVoiceFailureError {
  code: BrandVoiceFailureCode;
  detail: string;
  meta: IBrandVoiceFailureMeta;
  status: string;
  title: string;
}

/**
 * Redacted diagnostics for a brand voice failure, for logs and error tracking
 * only. Bounded by design: it describes the shape of what came back, never the
 * provider payload itself, and is never serialized into a response.
 */
export interface IBrandVoiceFailureDiagnostics {
  code: BrandVoiceFailureCode;
  isRetryable: boolean;
  missingFields: string[];
  outputLength: number;
}

/**
 * A classified brand voice failure as the app needs it: the message to show,
 * as a catalog key relative to the `pages.brandAgentProfile` namespace.
 */
export interface IBrandVoiceFailureView {
  code?: BrandVoiceFailureCode;
  messageKey: string;
}
