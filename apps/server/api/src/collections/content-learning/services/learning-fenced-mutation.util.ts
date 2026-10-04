import {
  type LearningMutationFenceScope,
  withLearningFenceEscalation,
} from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Runs a learning-aware mutation in one transaction under the organization
 * fence, rerunning it under the global fence when the fence escalates (#6158).
 */
export function runFencedLearningMutation<T>(
  prisma: Pick<PrismaService, '$transaction'>,
  mutate: (
    tx: Prisma.TransactionClient,
    fenceScope: LearningMutationFenceScope,
  ) => Promise<T>,
): Promise<T> {
  return withLearningFenceEscalation((fenceScope) =>
    prisma.$transaction((tx) => mutate(tx, fenceScope)),
  );
}
