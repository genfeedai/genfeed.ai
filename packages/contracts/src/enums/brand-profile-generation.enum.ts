/**
 * Why a generated brand profile was rejected before it reached the client.
 * Values are stable API contract: they classify provider-output failures for
 * observability without carrying any of the provider payload itself.
 */
export enum BrandProfileGenerationFailureReason {
  EMPTY_OUTPUT = 'EMPTY_OUTPUT',
  MALFORMED_JSON = 'MALFORMED_JSON',
  NOT_AN_OBJECT = 'NOT_AN_OBJECT',
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
}
