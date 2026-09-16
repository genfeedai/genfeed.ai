import { BrandProfileGenerationFailureReason } from '@genfeedai/contracts';
import type { IBrandProfileGenerationDiagnostics } from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';

export const BRAND_PROFILE_GENERATION_INVALID_CODE =
  'BRAND_PROFILE_GENERATION_INVALID';

const RETRY_HINT =
  'Try again; adding a website URL, description, or target audience gives the model more to work with.';

/** Actionable, payload-free client message for a classified failure. */
function buildDetail(diagnostics: IBrandProfileGenerationDiagnostics): string {
  switch (diagnostics.reason) {
    case BrandProfileGenerationFailureReason.EMPTY_OUTPUT:
      return `The model returned an empty brand profile. ${RETRY_HINT}`;
    case BrandProfileGenerationFailureReason.MISSING_REQUIRED_FIELDS:
      return `The generated brand profile is missing ${diagnostics.missingFields.join(', ')}. ${RETRY_HINT}`;
    case BrandProfileGenerationFailureReason.MALFORMED_JSON:
    case BrandProfileGenerationFailureReason.NOT_AN_OBJECT:
      return `The model returned an unreadable brand profile. ${RETRY_HINT}`;
  }
}

/**
 * Classified 422 for provider output that fails brand-profile validation.
 *
 * A model returning malformed or incomplete JSON is not an internal fault, so
 * it must not surface as a generic 500 (Sentry API-GENFEED-AI-7Q). The body
 * carries a stable `code` plus redacted diagnostics — shape only, never the
 * provider payload — so the failure is observable and the caller can act.
 */
export class BrandProfileGenerationException extends HttpException {
  /** @param diagnostics Redacted shape-only diagnostics; also exposed as `meta`. */
  constructor(public readonly diagnostics: IBrandProfileGenerationDiagnostics) {
    const detail = buildDetail(diagnostics);

    super(
      {
        code: BRAND_PROFILE_GENERATION_INVALID_CODE,
        detail,
        meta: diagnostics,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        title: 'Brand profile generation failed',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'BrandProfileGenerationException';
    this.message = detail;
  }
}
