import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  initializeLearningPolicy,
  LEARNING_ARMS,
  type LearningPolicyState,
  solveLearningRidge,
  updateLearningPolicy,
} from '@genfeedai/harness';
import { toPrismaJson } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
export function parseLearningPolicy(
  value: unknown,
): LearningPolicyState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = new Map<string, unknown>(Object.entries(value));
  const result = initializeLearningPolicy();
  const vector = (input: unknown): input is number[] =>
    Array.isArray(input) &&
    input.every(
      (cell: unknown) => typeof cell === 'number' && Number.isFinite(cell),
    );
  const matrix = (input: unknown): input is number[][] =>
    Array.isArray(input) && input.every((row: unknown) => vector(row));
  for (const arm of LEARNING_ARMS) {
    const candidate = entries.get(arm);
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      !('a' in candidate) ||
      !('b' in candidate) ||
      !matrix(candidate.a) ||
      !vector(candidate.b)
    )
      return null;
    result[arm] = { a: candidate.a, b: candidate.b };
    try {
      solveLearningRidge(result[arm]);
    } catch {
      return null;
    }
  }
  return result;
}
@Injectable()
export class LearningPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async current(
    organizationId: string,
    credentialId: string,
    scopeKey: string,
  ) {
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: { organizationId, credentialId, isDeleted: false },
    });
    if (
      !account?.activePolicyId ||
      account.mode !== 'live' ||
      account.failureReason
    )
      return null;
    const policy = await this.prisma.contentLearningPolicyVersion.findFirst({
      where: {
        id: account.activePolicyId,
        organizationId,
        credentialId,
        scopeKey,
        epoch: account.epoch,
        isDeleted: false,
        state: { in: ['active', 'retired'] },
        synthetic: false,
      },
    });
    if (
      !policy ||
      !(await this.dependencies.valid(
        'policy',
        policy.id,
        this.prisma,
        organizationId,
      ))
    )
      return null;
    const latest = await this.prisma.contentLearningReward.findFirst({
      where: {
        organizationId,
        credentialId,
        isDeleted: false,
        status: 'valid',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest || latest.createdAt.getTime() < Date.now() - 30 * 86400000)
      return null;
    return parseLearningPolicy(policy.armState) ? policy : null;
  }
  async rebuild(
    organizationId: string,
    credentialId: string,
    scopeKey: string,
  ) {
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: { organizationId, credentialId, isDeleted: false },
    });
    if (!account) return null;
    const decisions = await this.prisma.contentLearningDecision.findMany({
      where: {
        organizationId,
        credentialId,
        scopeKey,
        epoch: account.epoch,
        isDeleted: false,
        synthetic: false,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const state = initializeLearningPolicy(),
      evidenceIds: string[] = [];
    for (const decision of decisions) {
      const reward = await this.prisma.contentLearningReward.findFirst({
        where: {
          organizationId,
          credentialId,
          decisionId: decision.id,
          isDeleted: false,
        },
        orderBy: { version: 'desc' },
      });
      if (
        reward?.status !== 'valid' ||
        reward.composite == null ||
        !(await this.dependencies.valid(
          'reward',
          reward.id,
          this.prisma,
          organizationId,
        ))
      )
        continue;
      if (
        !LEARNING_ARMS.includes(
          decision.selectedArmId as (typeof LEARNING_ARMS)[number],
        )
      )
        continue;
      updateLearningPolicy(
        state,
        decision.selectedArmId as (typeof LEARNING_ARMS)[number],
        decision.contextVector,
        reward.composite,
      );
      evidenceIds.push(reward.id);
    }
    const coefficients = Object.fromEntries(
      LEARNING_ARMS.map((arm) => [arm, solveLearningRidge(state[arm])]),
    );
    const manifest = learningHash([
      scopeKey,
      account.epoch,
      evidenceIds,
      state,
    ]);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE id = ${account.id} AND "organizationId" = ${organizationId} ORDER BY id FOR UPDATE`;
      const current = await tx.contentLearningAccount.findFirst({
        where: { id: account.id, organizationId, isDeleted: false },
      });
      if (
        !current ||
        current.revision !== account.revision ||
        current.epoch !== account.epoch ||
        current.evidenceRevision !== account.evidenceRevision
      )
        return null;
      const identical = await tx.contentLearningPolicyVersion.findFirst({
        where: {
          organizationId,
          credentialId,
          scopeKey,
          epoch: account.epoch,
          evidenceManifestHash: manifest,
          isDeleted: false,
        },
      });
      if (identical) return identical;
      const prior = await tx.contentLearningPolicyVersion.findFirst({
        where: {
          organizationId,
          credentialId,
          scopeKey,
          epoch: account.epoch,
          isDeleted: false,
        },
        orderBy: { version: 'desc' },
      });
      const active = current.mode === 'live' && !current.failureReason;
      const policy = await tx.contentLearningPolicyVersion.create({
        data: {
          organizationId,
          brandId: account.brandId,
          credentialId,
          scopeKey,
          epoch: account.epoch,
          version: (prior?.version ?? 0) + 1,
          parentId: prior?.id,
          configVersion: account.activeConfigVersion,
          featureSchema: 'numeric-nine-v1',
          armState: toPrismaJson(state),
          coefficients: toPrismaJson(coefficients),
          evidenceManifestHash: manifest,
          evidenceIds,
          state: active ? 'active' : 'candidate',
        },
      });
      for (const id of evidenceIds)
        await this.dependencies.link(
          tx,
          await this.dependencies.resolve('reward', id, organizationId, tx),
          await this.dependencies.resolve(
            'policy',
            policy.id,
            organizationId,
            tx,
          ),
        );
      if (active)
        await tx.contentLearningAccount.updateMany({
          where: {
            id: account.id,
            organizationId,
            revision: account.revision,
            epoch: account.epoch,
            evidenceRevision: account.evidenceRevision,
            isDeleted: false,
          },
          data: { activePolicyId: policy.id, revision: { increment: 1 } },
        });
      return policy;
    });
  }
}
