import {
  BrandVoiceFailureCode,
  type IBrandVoiceFailureDiagnostics,
  type IBrandVoiceFailureMeta,
} from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';

/** Human-readable summary shared by every classified brand voice failure. */
export const BRAND_VOICE_FAILURE_TITLE = 'Brand voice generation failed';

/**
 * Causes another identical attempt could clear. Model output is sampled, so
 * the same request can succeed next time; a rejected input cannot until the
 * caller changes it.
 */
const RETRYABLE_CODES: ReadonlySet<BrandVoiceFailureCode> = new Set([
  BrandVoiceFailureCode.EMPTY_OUTPUT,
  BrandVoiceFailureCode.INCOMPLETE_PROFILE,
  BrandVoiceFailureCode.MALFORMED_OUTPUT,
  BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE,
]);

/**
 * 422 when the model returned something we cannot use, 400 when the request
 * itself was unusable. These mirror the statuses each cause already returned
 * before it was classified, so only the response body changes shape.
 */
const STATUS_BY_CODE: Record<BrandVoiceFailureCode, HttpStatus> = {
  [BrandVoiceFailureCode.BRAND_NOT_FOUND]: HttpStatus.BAD_REQUEST,
  [BrandVoiceFailureCode.EMPTY_OUTPUT]: HttpStatus.UNPROCESSABLE_ENTITY,
  [BrandVoiceFailureCode.INCOMPLETE_PROFILE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [BrandVoiceFailureCode.MALFORMED_OUTPUT]: HttpStatus.UNPROCESSABLE_ENTITY,
  [BrandVoiceFailureCode.SOURCE_REQUIRED]: HttpStatus.BAD_REQUEST,
  [BrandVoiceFailureCode.SOURCE_URL_INVALID]: HttpStatus.BAD_REQUEST,
  [BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE]:
    HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Appended to causes another attempt could clear. */
const RETRY_HINT =
  'Try again; adding a website URL, description, or target audience gives the model more to work with.';

/**
 * Default API-facing sentence per cause. The app shows its own translated copy
 * keyed by `code`; this is what a direct API consumer and the logs read.
 */
function buildDetail(
  code: BrandVoiceFailureCode,
  missingFields: string[],
): string {
  switch (code) {
    case BrandVoiceFailureCode.BRAND_NOT_FOUND:
      return 'Brand not found.';
    case BrandVoiceFailureCode.EMPTY_OUTPUT:
      return `The model returned an empty brand profile. ${RETRY_HINT}`;
    case BrandVoiceFailureCode.INCOMPLETE_PROFILE:
      return `The generated brand profile is missing ${missingFields.join(', ')}. ${RETRY_HINT}`;
    case BrandVoiceFailureCode.MALFORMED_OUTPUT:
    case BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE:
      return `The model returned an unreadable brand profile. ${RETRY_HINT}`;
    case BrandVoiceFailureCode.SOURCE_REQUIRED:
      return 'Either url or brandId must be provided.';
    case BrandVoiceFailureCode.SOURCE_URL_INVALID:
      return 'Provide a valid website URL to generate from.';
  }
}

interface BrandVoiceGenerationExceptionInput {
  code: BrandVoiceFailureCode;
  /** Overrides the default sentence when a caller knows something sharper. */
  detail?: string;
  /** Contract fields the model omitted; only set for `INCOMPLETE_PROFILE`. */
  missingFields?: string[];
  /** Characters the model returned, so a truncation shows up in logs. */
  outputLength?: number;
}

/**
 * Classified failure of `POST /v1/brands/:id/agent-config/generate-voice`.
 *
 * A model returning malformed or incomplete JSON is not an internal fault, so
 * it must not surface as a generic 500 (Sentry API-GENFEED-AI-7Q). The
 * response carries a public `code` and a retry hint in `meta` — written by
 * `BrandVoiceGenerationExceptionFilter`, because the global filter drops both
 * — while the redacted diagnostics stay on the instance for logs and never
 * reach the client.
 */
export class BrandVoiceGenerationException extends HttpException {
  public readonly code: BrandVoiceFailureCode;
  public readonly diagnostics: IBrandVoiceFailureDiagnostics;
  public readonly meta: IBrandVoiceFailureMeta;
  public readonly title = BRAND_VOICE_FAILURE_TITLE;

  constructor(input: BrandVoiceGenerationExceptionInput) {
    const status = STATUS_BY_CODE[input.code];
    const missingFields = input.missingFields ?? [];
    const detail = input.detail ?? buildDetail(input.code, missingFields);
    const meta: IBrandVoiceFailureMeta = {
      isRetryable: RETRYABLE_CODES.has(input.code),
    };

    super(
      {
        code: input.code,
        detail,
        meta,
        status,
        title: BRAND_VOICE_FAILURE_TITLE,
      },
      status,
    );

    this.name = 'BrandVoiceGenerationException';
    this.code = input.code;
    this.meta = meta;
    this.message = detail;
    this.diagnostics = {
      code: input.code,
      isRetryable: meta.isRetryable,
      missingFields,
      outputLength: input.outputLength ?? 0,
    };
  }

  public get isRetryable(): boolean {
    return this.meta.isRetryable;
  }
}
