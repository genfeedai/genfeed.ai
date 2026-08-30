export enum ReferralStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  EXPIRED = 'EXPIRED',
}

export enum ReferralRewardStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  GRANTED = 'GRANTED',
  CANCELLED = 'CANCELLED',
  REVERSED = 'REVERSED',
  FAILED = 'FAILED',
}

export enum ReferralClaimStatus {
  ACCEPTED = 'accepted',
  ALREADY_ATTRIBUTED = 'already-attributed',
  INELIGIBLE = 'ineligible',
  INVALID = 'invalid',
}
