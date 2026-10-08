import { createHash } from 'node:crypto';
import { learningFence } from '@api/collections/content-learning/services/learning-dependency.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { sha256Hex, stableStringify } from '@libs/utils/canonical-hash.util';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
export interface LearningActor {
  organizationId: string;
  actorId: string;
}
export function learningCanonicalHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}
export function learningHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function learningScopeKey(scope: {
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: string;
  format: string;
  objective: string;
  rewardProfileId: string;
}): string {
  return learningHash([
    scope.organizationId,
    scope.brandId,
    scope.credentialId,
    scope.platform,
    scope.format,
    scope.objective,
    scope.rewardProfileId,
  ]);
}
@Injectable()
export class LearningOperationService {
  constructor(private readonly prisma: PrismaService) {}
  async assertMember(
    actor: LearningActor,
    write = false,
    ownerOnly = false,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const member = await tx.member.findFirst({
      where: {
        organizationId: actor.organizationId,
        userId: actor.actorId,
        isDeleted: false,
        isActive: true,
      },
      include: { role: true },
    });
    if (
      !member ||
      (write &&
        !(ownerOnly ? ['owner'] : ['owner', 'admin']).includes(
          member.role.key.toLowerCase(),
        ))
    )
      throw new ForbiddenException(
        'Real organization membership and the required role are required',
      );
    return member;
  }
  async mutate(
    input: {
      actor: LearningActor;
      credentialId: string;
      requestId: string;
      expectedRevision: number;
      type: string;
      payload: unknown;
    },
    apply: (
      tx: Prisma.TransactionClient,
      account: Awaited<ReturnType<LearningOperationService['lockedAccount']>>,
    ) => Promise<unknown>,
  ) {
    const scope = learningHash([
      input.actor.organizationId,
      input.credentialId,
    ]);
    const payloadHash = learningHash([input.type, scope, input.payload]);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'exclusive');
      const account = await this.lockedAccount(
        tx,
        input.actor.organizationId,
        input.credentialId,
      );
      const previous = await tx.contentLearningOperation.findFirst({
        where: {
          organizationId: input.actor.organizationId,
          actorId: input.actor.actorId,
          scope,
          requestId: input.requestId,
          isDeleted: false,
        },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new ConflictException('Request key payload conflict');
        return previous;
      }
      if (account.revision !== input.expectedRevision)
        throw new ConflictException({
          reason: 'revision_conflict',
          currentRevision: account.revision,
        });
      const result = await apply(tx, account);
      const updated = await tx.contentLearningAccount.updateMany({
        where: {
          id: account.id,
          organizationId: input.actor.organizationId,
          revision: account.revision,
          isDeleted: false,
        },
        data: { revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Account revision changed');
      return tx.contentLearningOperation.create({
        data: {
          organizationId: account.organizationId,
          brandId: account.brandId,
          credentialId: account.credentialId,
          actorId: input.actor.actorId,
          scope,
          requestId: input.requestId,
          payloadHash,
          type: input.type,
          beforeRevision: account.revision,
          afterRevision: account.revision + 1,
          status: 'completed',
          resultReferences: toPrismaJson(result),
        },
      });
    });
  }
  async lockedAccount(
    tx: Prisma.TransactionClient,
    organizationId: string,
    credentialId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE "organizationId" = ${organizationId} AND "credentialId" = ${credentialId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
    const account = await tx.contentLearningAccount.findFirst({
      where: { organizationId, credentialId, isDeleted: false },
    });
    if (!account)
      throw new ConflictException(
        'Initialize the account before changing its revision',
      );
    return account;
  }
}
