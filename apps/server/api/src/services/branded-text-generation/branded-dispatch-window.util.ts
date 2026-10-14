import { brandedReceiptReasonCode } from '@api/services/branded-text-generation/branded-text-generation-outcome.util';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { ConflictException } from '@nestjs/common';

export const DISPATCH_WINDOW_EXPIRED_REASON = 'dispatch_window_expired';
const WINDOW_EXPIRY_CONFLICT = 'receipt_dispatch_window_expired';

/**
 * What `recordDispatch` throws when the dispatch window closed under it (the
 * state conflict and version conflict are what it throws when the recovery
 * sweep blocked the receipt first). Anything else is a real error.
 */
const WINDOW_RACE_CONFLICTS: ReadonlySet<string> = new Set([
  WINDOW_EXPIRY_CONFLICT,
  'receipt_state_conflict',
  'receipt_version_conflict',
]);

export function isDispatchWindowRace(
  error: unknown,
): error is ConflictException {
  return (
    error instanceof ConflictException &&
    WINDOW_RACE_CONFLICTS.has(error.message)
  );
}

/** The window itself expired, so a still-`resolved` receipt must be blocked here. */
export function isDispatchWindowExpiry(error: ConflictException): boolean {
  return error.message === WINDOW_EXPIRY_CONFLICT;
}

/** Blocked because the dispatch window ran out, by this request or by the sweep. */
export function isDispatchWindowBlock(
  receipt: BrandedGenerationReceiptV1,
): boolean {
  return (
    receipt.state === 'blocked' &&
    brandedReceiptReasonCode(receipt) === DISPATCH_WINDOW_EXPIRED_REASON
  );
}
