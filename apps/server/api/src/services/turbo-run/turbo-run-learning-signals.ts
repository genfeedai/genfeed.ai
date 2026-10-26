import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { ITurboRunLearningSignals } from '@genfeedai/contracts/interfaces';

/**
 * Counts the earlier review decisions the brand's active harness profile holds
 * at generation time. Those are the rejections and approvals that reach the
 * brief for this batch, so the count is what the reviewer is told it used.
 *
 * Returns undefined without a brand, a profile or any signal: the receipt only
 * exists when there is something to say.
 */
export async function resolveTurboRunLearningSignals(
  harnessProfilesService: HarnessProfilesService | undefined,
  organizationId: string,
  brandId: string | null | undefined,
): Promise<ITurboRunLearningSignals | undefined> {
  if (!harnessProfilesService || !brandId) {
    return undefined;
  }

  const profile = await harnessProfilesService.getActiveForBrand(
    organizationId,
    brandId,
  );
  const rejectionCount = profile?.avoidFeedback?.length ?? 0;
  const approvalCount = profile?.goodFeedback?.length ?? 0;

  return rejectionCount + approvalCount > 0
    ? { approvalCount, rejectionCount }
    : undefined;
}
