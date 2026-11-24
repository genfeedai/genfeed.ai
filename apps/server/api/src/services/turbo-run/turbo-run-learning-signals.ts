import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { ITurboRunLearningSignals } from '@genfeedai/contracts/interfaces';

/**
 * Counts the earlier approvals the brand's active harness profile holds as
 * positive examples at generation time: an approved draft is kept in
 * `examples.good`, which generation reads, and tracked in `goodFeedback`.
 *
 * Rejections are not counted. They are written only to the `avoidFeedback`
 * audit trail, which generation never reads; telling the reviewer a batch
 * "used" them would be untrue.
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
  const positiveExamples = new Set(profile?.examples?.good ?? []);
  const approvalCount = (profile?.goodFeedback ?? []).filter((entry) =>
    positiveExamples.has(entry.content),
  ).length;

  return approvalCount > 0 ? { approvalCount } : undefined;
}
