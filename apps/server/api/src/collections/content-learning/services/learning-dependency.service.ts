import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
@Injectable()
export class LearningDependencyService {
  constructor(private readonly prisma: PrismaService) {}
  async valid(
    kind: string,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const edges = await tx.contentLearningDependency.findMany({
      where: { derivedKind: kind, derivedId: id, isDeleted: false },
    });
    for (const edge of edges) {
      if (!edge.valid) return false;
      if (edge.sourceKind === 'consent') {
        const consent = await tx.contentLearningConsent.findFirst({
          where: { id: edge.sourceId, isDeleted: false },
        });
        if (!consent?.granted || consent.revokedAt) return false;
        const account = await tx.contentLearningAccount.findFirst({
          where: {
            id: consent.accountId,
            organizationId: consent.organizationId,
            isDeleted: false,
          },
        });
        if (!account || account.sharingConsentVersion !== consent.version)
          return false;
      }
    }
    return true;
  }
  async link(
    tx: Prisma.TransactionClient,
    sourceKind: string,
    sourceId: string,
    sourceVersion: string,
    derivedKind: string,
    derivedId: string,
  ) {
    return tx.contentLearningDependency.upsert({
      where: {
        sourceKind_sourceId_sourceVersion_derivedKind_derivedId: {
          sourceKind,
          sourceId,
          sourceVersion,
          derivedKind,
          derivedId,
        },
      },
      create: { sourceKind, sourceId, sourceVersion, derivedKind, derivedId },
      update: {},
    });
  }
  async invalidate(
    sourceKind: string,
    sourceId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const queue = [{ kind: sourceKind, id: sourceId }],
      visited = new Set<string>();
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      const key = JSON.stringify(current);
      if (visited.has(key)) continue;
      visited.add(key);
      const edges = await tx.contentLearningDependency.findMany({
        where: {
          sourceKind: current.kind,
          sourceId: current.id,
          isDeleted: false,
        },
        orderBy: { id: 'asc' },
      });
      for (const edge of edges) {
        await tx.contentLearningDependency.updateMany({
          where: { id: edge.id, isDeleted: false },
          data: { valid: false, invalidatedAt: new Date() },
        });
        if (edge.derivedKind === 'reward')
          await tx.contentLearningReward.updateMany({
            where: { id: edge.derivedId, isDeleted: false },
            data: {
              status:
                sourceKind === 'checkpoint'
                  ? 'invalid_baseline'
                  : 'invalid_source',
            },
          });
        if (edge.derivedKind === 'policy')
          await tx.contentLearningPolicyVersion.updateMany({
            where: { id: edge.derivedId, isDeleted: false },
            data: { state: 'invalid' },
          });
        if (edge.derivedKind === 'dataset')
          await tx.contentLearningDataset.updateMany({
            where: { id: edge.derivedId, isDeleted: false },
            data: {
              status: 'invalidated',
              invalidationRevision: { increment: 1 },
            },
          });
        if (edge.derivedKind === 'run')
          await tx.contentLearningRun.updateMany({
            where: { id: edge.derivedId, isDeleted: false },
            data: { status: 'invalidated' },
          });
        if (edge.derivedKind === 'shared-policy')
          await tx.contentLearningSharedPolicy.updateMany({
            where: { id: edge.derivedId, isDeleted: false },
            data: { validity: 'invalid' },
          });
        if (edge.derivedKind === 'release')
          await tx.contentLearningRelease.updateMany({
            where: { id: edge.derivedId, isDeleted: false },
            data: {
              stage: 'invalid',
              revision: { increment: 1 },
              invalidationRevision: { increment: 1 },
              activeCells: [],
            },
          });
        queue.push({ kind: edge.derivedKind, id: edge.derivedId });
      }
    }
    return visited.size;
  }
}
