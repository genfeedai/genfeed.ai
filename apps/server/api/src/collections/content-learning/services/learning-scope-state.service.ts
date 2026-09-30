import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import {
  type LearningCellDescriptor,
  type LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
@Injectable()
export class LearningScopeStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async ensure(
    tx: Prisma.TransactionClient = this.prisma,
    scope: LearningScope,
    descriptor: LearningCellDescriptor,
    epoch: number,
  ) {
    const descriptorHash = learningHash(learningDescriptorTuple(descriptor));
    if (
      !validLearningDescriptor(descriptor) ||
      descriptorHash !== scope.rewardProfileId ||
      descriptor.platform !== scope.platform ||
      descriptor.format !== scope.format ||
      descriptor.objective !== scope.objective
    )
      throw new BadRequestException(
        'Immutable registered cell descriptor required',
      );
    const credential = await tx.credential.findFirst({
      where: {
        id: scope.credentialId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
      },
    });
    if (
      !credential ||
      fromPrismaCredentialPlatform(credential.platform) !== descriptor.platform
    )
      throw new BadRequestException('Descriptor destination mismatch');
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        organizationId: scope.organizationId,
        credentialId: scope.credentialId,
        brandId: scope.brandId,
        isDeleted: false,
      },
    });
    if (!account || account.epoch !== epoch)
      throw new ConflictException('Account epoch changed');
    // tenant-scope-ignore: unique-key upsert; organizationId is part of the key
    return tx.contentLearningScopeState.upsert({
      where: {
        organizationId_credentialId_scopeKey_epoch: {
          organizationId: scope.organizationId,
          credentialId: scope.credentialId,
          scopeKey: learningScopeKey(scope),
          epoch,
        },
      },
      create: {
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        credentialId: scope.credentialId,
        scopeKey: learningScopeKey(scope),
        epoch,
        cellDescriptor: descriptor,
        descriptorHash,
      },
      update: {},
    });
  }
  async read(
    tx: Prisma.TransactionClient,
    organizationId: string,
    credentialId: string,
    scopeKey: string,
    epoch: number,
  ) {
    return tx.contentLearningScopeState.findFirst({
      where: {
        organizationId,
        credentialId,
        scopeKey,
        epoch,
        isDeleted: false,
      },
    });
  }
  async activate(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      credentialId: string;
      scopeKey: string;
      epoch: number;
      accountRevision: number;
      evidenceRevision: number;
      scopeRevision: number;
      policyId: string;
      lastValidRewardAt: Date;
    },
  ) {
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        organizationId: input.organizationId,
        credentialId: input.credentialId,
        isDeleted: false,
      },
    });
    const scope = await this.read(
      tx,
      input.organizationId,
      input.credentialId,
      input.scopeKey,
      input.epoch,
    );
    if (
      !account ||
      !scope ||
      account.mode !== 'live' ||
      account.failureReason ||
      account.epoch !== input.epoch ||
      account.revision !== input.accountRevision ||
      account.evidenceRevision !== input.evidenceRevision ||
      scope.revision !== input.scopeRevision ||
      scope.pinnedPolicyId
    )
      return null;
    const policy = await tx.contentLearningPolicyVersion.findFirst({
      where: {
        id: input.policyId,
        organizationId: input.organizationId,
        credentialId: input.credentialId,
        scopeKey: input.scopeKey,
        epoch: input.epoch,
        descriptorHash: scope.descriptorHash,
        synthetic: false,
        state: { in: ['shadow', 'active', 'retired'] },
        isDeleted: false,
      },
    });
    if (
      !policy ||
      !(await this.dependencies.valid(
        'policy',
        policy.id,
        tx,
        input.organizationId,
      ))
    )
      return null;
    const changed = await tx.contentLearningScopeState.updateMany({
      where: {
        id: scope.id,
        organizationId: input.organizationId,
        revision: scope.revision,
        epoch: input.epoch,
        pinnedPolicyId: null,
        isDeleted: false,
      },
      data: {
        activePolicyId: policy.id,
        lastValidRewardAt: input.lastValidRewardAt,
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('Scope revision changed');
    await tx.contentLearningPolicyVersion.updateMany({
      where: {
        organizationId: input.organizationId,
        credentialId: input.credentialId,
        scopeKey: input.scopeKey,
        epoch: input.epoch,
        state: 'active',
        id: { not: policy.id },
        isDeleted: false,
      },
      data: { state: 'retired' },
    });
    await tx.contentLearningPolicyVersion.updateMany({
      where: {
        id: policy.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: { state: 'active' },
    });
    return this.read(
      tx,
      input.organizationId,
      input.credentialId,
      input.scopeKey,
      input.epoch,
    );
  }
  async pin(
    tx: Prisma.TransactionClient,
    organizationId: string,
    credentialId: string,
    policyId: string,
    epoch: number,
  ) {
    if (!policyId.trim())
      throw new BadRequestException('Rollback requires policyId');
    const policy = await tx.contentLearningPolicyVersion.findFirst({
      where: {
        id: policyId,
        organizationId,
        credentialId,
        epoch,
        isDeleted: false,
        synthetic: false,
        state: { in: ['active', 'shadow', 'retired'] },
      },
    });
    if (
      !policy ||
      !(await this.dependencies.valid('policy', policy.id, tx, organizationId))
    )
      throw new ConflictException('Valid current-epoch scoped policy required');
    const scope = await this.read(
      tx,
      organizationId,
      credentialId,
      policy.scopeKey,
      epoch,
    );
    if (!scope || scope.descriptorHash !== policy.descriptorHash)
      throw new ConflictException('Policy scope descriptor mismatch');
    await tx.contentLearningScopeState.updateMany({
      where: {
        id: scope.id,
        organizationId,
        isDeleted: false,
        revision: scope.revision,
      },
      data: {
        pinnedPolicyId: policy.id,
        activePolicyId: policy.id,
        revision: { increment: 1 },
      },
    });
    return this.read(tx, organizationId, credentialId, policy.scopeKey, epoch);
  }
}
