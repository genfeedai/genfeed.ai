import { TargetExecutionState } from '@genfeedai/contracts';
import { isManualPostErrorCode } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import type {
  AccountHealthSummary,
  IChannelTarget,
} from '@genfeedai/contracts/interfaces';

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

/**
 * A FAILED target the person closes by posting it themselves, because the
 * provider refused something only they can do (an X quote post on a plan
 * without quote access).
 */
export function isManualPostTarget(target: IChannelTarget): boolean {
  return (
    target.executionState === TargetExecutionState.FAILED &&
    isManualPostErrorCode(target.error?.code)
  );
}
