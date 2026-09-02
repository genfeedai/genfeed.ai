import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';

/**
 * Mirrors `isAccountAtRisk` from the rail's account chips, but answers the
 * question for one target's credential rather than for an entire account
 * list: does account-health say this target's credential needs reconnecting?
 * Distinct from `isTargetBlockedByReadiness` in `release-status.helpers.ts`,
 * which reads the target's own `readiness` diagnostics — a target can be
 * blocked by one, the other, both, or neither.
 */
export function isCredentialAtRisk(
  accountHealth: AccountHealthSummary[],
  credentialId: string | null | undefined,
): boolean {
  if (!credentialId) {
    return false;
  }
  const account = accountHealth.find(
    (candidate) => candidate.credentialId === credentialId,
  );
  if (!account) {
    return false;
  }
  return account.holdPublishing || Boolean(account.reconnect?.isAvailable);
}
