import { isStripeSignatureVerificationError } from '@api/services/integrations/stripe/services/stripe-error.util';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export const StripeWebhookErrorKind = {
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
    errorName: getErrorName(error),
    ...(event?.id ? { eventId: event.id } : {}),
    ...(event?.type ? { eventType: event.type } : {}),
    kind: mapStripeWebhookError(error).kind,
  };
}

export function toStripeWebhookException(error: unknown): unknown {
  const mapping = mapStripeWebhookError(error);

  if (
    mapping.kind === StripeWebhookErrorKind.SIGNATURE &&
    !(error instanceof HttpException)
  ) {
    return new BadRequestException(INVALID_STRIPE_SIGNATURE);
  }

  return error;
}
