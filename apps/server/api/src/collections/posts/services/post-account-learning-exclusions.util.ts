import { projectApprovedBrandIdentitySnapshot } from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { deriveBrandLearningCompatibility } from '@api/services/harness/branded-generation-compatibility';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { LearningArmExclusionV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { BrandOsRevisionStatus } from '@genfeedai/prisma';

const NON_BASELINE_ARMS = ['question-example-v1', 'proof-steps-v1'];

/**
 * The fixed learning arms the brand's single approved revision rules out for
 * text, read without side effects. A brand with no readable approved revision
 * excludes every non-baseline arm: learning never outranks brand truth.
 */
export async function readLearningArmExclusionsV1(
  prisma: Pick<PrismaService, 'brandOsRevision'>,
  scope: { organizationId: string; brandId: string },
  at: Date,
): Promise<LearningArmExclusionV1[]> {
  const unavailable = NON_BASELINE_ARMS.map((armId) => ({
    armId,
    reasonCode: 'brand_identity_unavailable',
  }));
  try {
    const revisions = await prisma.brandOsRevision.findMany({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        status: BrandOsRevisionStatus.APPROVED,
      }),
      take: 2,
    });
    if (revisions.length !== 1) return unavailable;
    const snapshot = projectApprovedBrandIdentitySnapshot(
      revisions[0],
      at.toISOString(),
    );
    const [constraints, diagnostics] = deriveBrandLearningCompatibility(
      snapshot,
      'text',
    );
    const excluded = constraints.excludedArmIds;
    return excluded.map((armId, index) => ({
      armId,
      reasonCode:
        diagnostics.length === excluded.length
          ? diagnostics[index].code
          : (diagnostics[0]?.code ?? 'learning_incompatible'),
    }));
  } catch {
    return unavailable;
  }
}
