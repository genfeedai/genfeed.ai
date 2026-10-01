import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  initializeLearningPolicy,
  LEARNING_ARMS,
  type LearningPolicyState,
  learningDescriptorTuple,
  solveLearningRidge,
  updateLearningPolicy,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningDecision,
  type ContentLearningReward,
  type ContentLearningScopeState,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';
export function parseLearningPolicy(
  value: unknown,
): LearningPolicyState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = new Map<string, unknown>(Object.entries(value));
  const result = initializeLearningPolicy();
  const vector = (input: unknown): input is number[] =>
    Array.isArray(input) &&
    input.length === 9 &&
    input.every(
      (cell: unknown) => typeof cell === 'number' && Number.isFinite(cell),
    );
  const matrix = (input: unknown): input is number[][] =>
    Array.isArray(input) &&
    input.length === 9 &&
    input.every((row: unknown) => vector(row));
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
    private readonly scopes: LearningScopeStateService,
  ) {}
  async current(
    organizationId: string,
    credentialId: string,
    scopeKey: string,
    tx?: Prisma.TransactionClient,
  ) {
    const read = async (client: Prisma.TransactionClient) => {
      const account = await client.contentLearningAccount.findFirst({
        where: { organizationId, credentialId, isDeleted: false },
      });
      if (account?.mode !== 'live' || account.failureReason) return null;
      const scope = await this.scopes.read(
        client,
        organizationId,
        credentialId,
        scopeKey,
        account.epoch,
      );
      if (
        !scope ||
        scope.brandId !== account.brandId ||
        !validLearningDescriptor(scope.cellDescriptor) ||
        learningHash(learningDescriptorTuple(scope.cellDescriptor)) !==
          scope.descriptorHash ||
        !scope.lastValidRewardAt ||
        !Number.isFinite(scope.lastValidRewardAt.getTime()) ||
        scope.lastValidRewardAt.getTime() > Date.now() ||
        scope.lastValidRewardAt.getTime() < Date.now() - 30 * 86400000
      )
        return null;
      const pointer = scope.pinnedPolicyId ?? scope.activePolicyId;
      if (!pointer) return null;
      const policy = await client.contentLearningPolicyVersion.findFirst({
        where: {
          id: pointer,
          organizationId,
          brandId: account.brandId,
          credentialId,
          scopeKey,
          epoch: account.epoch,
          descriptorHash: scope.descriptorHash,
          isDeleted: false,
          state: { in: ['active', 'retired'] },
          synthetic: false,
        },
      });
      if (
        !policy ||
        !validLearningDescriptor(policy.cellDescriptor) ||
        learningHash(learningDescriptorTuple(policy.cellDescriptor)) !==
          scope.descriptorHash ||
        !parseLearningPolicy(policy.armState) ||
        !(await this.dependencies.valid(
          'policy',
          policy.id,
          client,
          organizationId,
        ))
      )
        return null;
      // Freshness must be corroborated by evidence from this policy's exact scope.
      const rewards = await client.contentLearningReward.findMany({
        where: {
          id: { in: policy.evidenceIds },
          organizationId,
          brandId: account.brandId,
          credentialId,
          status: 'valid',
          isDeleted: false,
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      for (const reward of rewards) {
        if (
          reward.composite === null ||
          !Number.isFinite(reward.composite) ||
          reward.composite < -1 ||
          reward.composite > 1 ||
          !Number.isFinite(reward.createdAt.getTime()) ||
          reward.createdAt.getTime() > Date.now()
        )
          continue;
        const decision = await client.contentLearningDecision.findFirst({
          where: {
            id: reward.decisionId,
            organizationId,
            brandId: account.brandId,
            credentialId,
            scopeKey,
            epoch: account.epoch,
            descriptorHash: scope.descriptorHash,
            synthetic: false,
            isDeleted: false,
          },
        });
        if (
          decision &&
          (await this.dependencies.valid(
            'reward',
            reward.id,
            client,
            organizationId,
          ))
        )
          return policy;
      }
      return null;
    };
    if (tx) return read(tx);
    return this.prisma.$transaction(async (client) => {
      await learningFence(client, 'shared');
      return read(client);
    });
  }
  private async collectPolicyEvidence(
    tx: Prisma.TransactionClient,
    organizationId: string,
    credentialId: string,
    account: ContentLearningAccount,
    scope: ContentLearningScopeState,
    decisions: ContentLearningDecision[],
  ) {
    const state = initializeLearningPolicy(),
      evidence: Array<
        Pick<
          ContentLearningReward,
          'id' | 'version' | 'decisionId' | 'createdAt'
        >
      > = [];
    for (const decision of decisions) {
      if (
        !validLearningDescriptor(decision.cellDescriptor) ||
        learningHash(learningDescriptorTuple(decision.cellDescriptor)) !==
          scope.descriptorHash ||
        decision.contextVector.length !== 9 ||
        decision.contextVector.some((value) => !Number.isFinite(value)) ||
        !LEARNING_ARMS.includes(
          decision.selectedArmId as (typeof LEARNING_ARMS)[number],
        ) ||
        !(await this.dependencies.valid(
          'decision',
          decision.id,
          tx,
          organizationId,
        ))
      )
        continue;
      const reward = await tx.contentLearningReward.findFirst({
        where: {
          organizationId,
          brandId: account.brandId,
          credentialId,
          decisionId: decision.id,
          isDeleted: false,
        },
        orderBy: { version: 'desc' },
      });
      if (
        reward?.status !== 'valid' ||
        reward.composite === null ||
        !Number.isFinite(reward.composite) ||
        reward.composite < -1 ||
        reward.composite > 1 ||
        !Number.isFinite(reward.createdAt.getTime()) ||
        reward.createdAt.getTime() > Date.now() ||
        !(await this.dependencies.valid(
          'reward',
          reward.id,
          tx,
          organizationId,
        ))
      )
        continue;
      updateLearningPolicy(
        state,
        decision.selectedArmId as (typeof LEARNING_ARMS)[number],
        decision.contextVector,
        reward.composite,
      );
      evidence.push({
        id: reward.id,
        version: reward.version,
        decisionId: decision.id,
        createdAt: reward.createdAt,
      });
    }
    return { state, evidence };
  }
  private async assertEvidenceCurrent(
    tx: Prisma.TransactionClient,
    organizationId: string,
    evidence: ReadonlyArray<Pick<ContentLearningReward, 'id' | 'decisionId'>>,
  ): Promise<void> {
    for (const reward of evidence)
      if (
        !(await this.dependencies.valid(
          'decision',
          reward.decisionId,
          tx,
          organizationId,
        )) ||
        !(await this.dependencies.valid(
          'reward',
          reward.id,
          tx,
          organizationId,
        ))
      )
        throw new ConflictException('Policy evidence changed');
  }
  async rebuild(
    organizationId: string,
    credentialId: string,
    scopeKey: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const account = await tx.contentLearningAccount.findFirst({
        where: { organizationId, credentialId, isDeleted: false },
      });
      if (!account) return null;
      const scope = await this.scopes.read(
        tx,
        organizationId,
        credentialId,
        scopeKey,
        account.epoch,
      );
      if (
        !scope ||
        scope.brandId !== account.brandId ||
        !validLearningDescriptor(scope.cellDescriptor) ||
        learningHash(learningDescriptorTuple(scope.cellDescriptor)) !==
          scope.descriptorHash
      )
        return null;
      const decisions = await tx.contentLearningDecision.findMany({
        where: {
          organizationId,
          brandId: account.brandId,
          credentialId,
          scopeKey,
          epoch: account.epoch,
          descriptorHash: scope.descriptorHash,
          isDeleted: false,
          synthetic: false,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const { state, evidence } = await this.collectPolicyEvidence(
        tx,
        organizationId,
        credentialId,
        account,
        scope,
        decisions,
      );
      if (!evidence.length) return null;
      const coefficients = Object.fromEntries(
        LEARNING_ARMS.map((arm) => [arm, solveLearningRidge(state[arm])]),
      );
      const manifest = learningHash([
        scopeKey,
        account.epoch,
        scope.descriptorHash,
        learningDescriptorTuple(scope.cellDescriptor),
        evidence.map((reward) => [reward.id, reward.version]),
        state,
      ]);
      const lastValidRewardAt = new Date(
        Math.max(...evidence.map((reward) => reward.createdAt.getTime())),
      );
      await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE id = ${account.id} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM content_learning_scope_states WHERE id = ${scope.id} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
      const current = await tx.contentLearningAccount.findFirst({
        where: { id: account.id, organizationId, isDeleted: false },
      });
      const currentScope = await this.scopes.read(
        tx,
        organizationId,
        credentialId,
        scopeKey,
        account.epoch,
      );
      if (
        !current ||
        current.revision !== account.revision ||
        current.epoch !== account.epoch ||
        current.evidenceRevision !== account.evidenceRevision ||
        !currentScope ||
        currentScope.revision !== scope.revision ||
        currentScope.descriptorHash !== scope.descriptorHash
      )
        throw new ConflictException('Learning scope changed during rebuild');
      await this.assertEvidenceCurrent(tx, organizationId, evidence);
      let policy = await tx.contentLearningPolicyVersion.findFirst({
        where: {
          organizationId,
          brandId: account.brandId,
          credentialId,
          scopeKey,
          epoch: account.epoch,
          descriptorHash: scope.descriptorHash,
          evidenceManifestHash: manifest,
          isDeleted: false,
          synthetic: false,
          state: { in: ['shadow', 'active', 'retired'] },
        },
      });
      if (
        policy &&
        (!validLearningDescriptor(policy.cellDescriptor) ||
          learningHash(learningDescriptorTuple(policy.cellDescriptor)) !==
            scope.descriptorHash ||
          !parseLearningPolicy(policy.armState) ||
          !(await this.dependencies.valid(
            'policy',
            policy.id,
            tx,
            organizationId,
          )))
      )
        throw new ConflictException('Identical policy source invalid');
      if (!policy) {
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
        policy = await tx.contentLearningPolicyVersion.create({
          data: {
            organizationId,
            brandId: account.brandId,
            credentialId,
            scopeKey,
            epoch: account.epoch,
            cellDescriptor: toPrismaJson(scope.cellDescriptor),
            descriptorHash: scope.descriptorHash,
            version: (prior?.version ?? 0) + 1,
            parentId: prior?.id,
            configVersion: account.activeConfigVersion,
            featureSchema: 'numeric-nine-v1',
            armState: toPrismaJson(state),
            coefficients: toPrismaJson(coefficients),
            evidenceManifestHash: manifest,
            evidenceIds: evidence.map((reward) => reward.id),
            state: 'shadow',
          },
        });
        for (const reward of evidence)
          await this.dependencies.link(
            tx,
            await this.dependencies.resolve(
              'reward',
              reward.id,
              organizationId,
              tx,
            ),
            await this.dependencies.resolve(
              'policy',
              policy.id,
              organizationId,
              tx,
            ),
          );
      }
      const activated = await this.scopes.activate(tx, {
        organizationId,
        credentialId,
        scopeKey,
        epoch: account.epoch,
        accountRevision: account.revision,
        evidenceRevision: account.evidenceRevision,
        scopeRevision: scope.revision,
        policyId: policy.id,
        lastValidRewardAt,
      });
      return activated ? { ...policy, state: 'active' } : policy;
    });
  }
}
