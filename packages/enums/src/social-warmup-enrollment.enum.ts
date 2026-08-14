/**
 * Prisma-backed guided social warm-up labels. Values match Postgres enums
 * exactly (SCREAMING_SNAKE). Distinct from admin `WarmupAccountStatus`.
 *
 * @see packages/prisma/prisma/schema.prisma
 */
export enum SocialWarmupEnrollmentState {
  ENROLLED = 'ENROLLED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  GRADUATED = 'GRADUATED',
  BLOCKED = 'BLOCKED',
  DISCONNECTED = 'DISCONNECTED',
}

export enum SocialWarmupEventAction {
  COMPLETED = 'COMPLETED',
  REOPENED = 'REOPENED',
}

export enum SocialWarmupSignalStatus {
  AVAILABLE = 'AVAILABLE',
  EMPTY = 'EMPTY',
  STALE = 'STALE',
  UNAVAILABLE = 'UNAVAILABLE',
  PERMISSION_LIMITED = 'PERMISSION_LIMITED',
  FAILED = 'FAILED',
  MISSING = 'MISSING',
  REVOKED = 'REVOKED',
}

export enum SocialWarmupSignalSource {
  PLATFORM = 'PLATFORM',
  GENFEED = 'GENFEED',
  USER = 'USER',
}
