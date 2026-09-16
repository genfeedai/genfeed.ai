import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { isStripeSignatureVerificationError } from '@api/services/integrations/stripe/services/stripe-error.util';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export const StripeWebhookErrorKind = {
  BILLING: 'BILLING',
  EXPECTED: 'EXPECTED',
  FAULT: 'FAULT',
  IDEMPOTENT: 'IDEMPOTENT',
  REPLAY: 'REPLAY',
  SIGNATURE: 'SIGNATURE',
} as const;

export type StripeWebhookErrorKind =
  (typeof StripeWebhookErrorKind)[keyof typeof StripeWebhookErrorKind];

export type StripeWebhookErrorMapping = {
  kind: StripeWebhookErrorKind;
  shouldAcknowledge: boolean;
  shouldReleaseIdempotencyKey: boolean;
  shouldReportAsFault: boolean;
  status: number;
};

export type StripeWebhookErrorDiagnostics = {
  code?: string;
  errorName: string;
  eventId?: string;
  eventType?: string;
  kind: StripeWebhookErrorKind;
};

const INVALID_STRIPE_SIGNATURE = 'Invalid Stripe signature';

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function isInvalidStripeSignatureException(error: unknown): boolean {
  return (
    error instanceof BadRequestException &&
    error.message === INVALID_STRIPE_SIGNATURE
  );
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  if (isPrismaUniqueConstraintError(error)) {
    return 'PrismaUniqueConstraintError';
  }

  return 'UnknownError';
}

export function mapStripeWebhookError(
  error: unknown,
): StripeWebhookErrorMapping {
  if (error instanceof StripeWebhookBillingError) {
    if (error.isRetryable) {
      return {
        kind: StripeWebhookErrorKind.BILLING,
        shouldAcknowledge: false,
        shouldReleaseIdempotencyKey: true,
        shouldReportAsFault: false,
        status: HttpStatus.SERVICE_UNAVAILABLE,
      };
    }

    // Deterministic identity/payload failures are acknowledged like a replay:
    // the event key stays acquired so the same delivery is not reprocessed,
    // and the controller logs one structured warning carrying the code.
    return {
      kind: StripeWebhookErrorKind.BILLING,
      shouldAcknowledge: true,
      shouldReleaseIdempotencyKey: false,
      shouldReportAsFault: false,
      status: HttpStatus.OK,
    };
  }
  if (isPrismaUniqueConstraintError(error)) {
    return {
      kind: StripeWebhookErrorKind.REPLAY,
      shouldAcknowledge: true,
      shouldReleaseIdempotencyKey: false,
      shouldReportAsFault: false,
      status: HttpStatus.OK,
    };
  }

  if (
    isStripeSignatureVerificationError(error) ||
    isInvalidStripeSignatureException(error)
  ) {
    return {
      kind: StripeWebhookErrorKind.SIGNATURE,
      shouldAcknowledge: false,
      shouldReleaseIdempotencyKey: false,
      shouldReportAsFault: false,
      status: HttpStatus.BAD_REQUEST,
    };
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();

    if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        kind: StripeWebhookErrorKind.EXPECTED,
        shouldAcknowledge: false,
        shouldReleaseIdempotencyKey: false,
        shouldReportAsFault: false,
        status,
      };
    }

    return {
      kind: StripeWebhookErrorKind.FAULT,
      shouldAcknowledge: false,
      shouldReleaseIdempotencyKey: true,
      shouldReportAsFault: true,
      status,
    };
  }

  return {
    kind: StripeWebhookErrorKind.FAULT,
    shouldAcknowledge: false,
    shouldReleaseIdempotencyKey: true,
    shouldReportAsFault: true,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  };
}

export function getStripeWebhookErrorDiagnostics(
  error: unknown,
  event?: { id?: string; type?: string } | null,
): StripeWebhookErrorDiagnostics {
  return {
    ...(error instanceof StripeWebhookBillingError ? { code: error.code } : {}),
    errorName: getErrorName(error),
    ...(event?.id ? { eventId: event.id } : {}),
    ...(event?.type ? { eventType: event.type } : {}),
    kind: mapStripeWebhookError(error).kind,
  };
}

export function toStripeWebhookException(error: unknown): unknown {
  if (error instanceof StripeWebhookBillingError) return error;
  const mapping = mapStripeWebhookError(error);

  if (
    mapping.kind === StripeWebhookErrorKind.SIGNATURE &&
    !(error instanceof HttpException)
  ) {
    return new BadRequestException(INVALID_STRIPE_SIGNATURE);
  }

  return error;
}
