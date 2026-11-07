import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { UpdateVoteDto } from '@api/collections/votes/dto/update-vote.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { VoteEntityModel } from '@genfeedai/contracts';
import type { Vote } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';
import { Traced } from '@libs/tracing/traced';
import { ConflictException, Injectable } from '@nestjs/common';

const ADD_VOTE_MAX_ATTEMPTS = 3;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Traced()
@Injectable()
export class VotesService extends BaseService<
  Vote,
  CreateVoteDto,
  UpdateVoteDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'vote', logger);
  }

  /**
   * Whether the voted-on entity (a prompt or an ingredient) exists, is not
   * deleted and belongs to `organizationId`. Callers check this before
   * `addVote` so a foreign or unknown id never reaches the votes table.
   */
  async isEntityInOrganization(
    entityModel: VoteEntityModel,
    entityId: string,
    organizationId: string,
  ): Promise<boolean> {
    const where = { id: entityId, isDeleted: false, organizationId };

    const row =
      entityModel === VoteEntityModel.PROMPT
        ? await this.prisma.prompt.findFirst({ select: { id: true }, where })
        : await this.prisma.ingredient.findFirst({
            select: { id: true },
            where,
          });

    return Boolean(row);
  }

  /**
   * Add a user's vote on an entity. Idempotent: an active vote is returned
   * as-is, a soft-deleted one is revived, and only otherwise is a row
   * inserted. The partial unique index `votes_entity_user_active_uidx`
   * (`entityId, userId WHERE isDeleted = false`) makes concurrent adds
   * converge: the loser's insert fails with P2002 and re-reads the winner's
   * row. The caller must already have verified that `entityId` belongs to
   * `organizationId`.
   */
  async addVote(input: {
    entityId: string;
    entityModel: VoteEntityModel;
    organizationId?: string;
    userId: string;
  }): Promise<{ created: boolean; vote: Vote }> {
    const { entityId, entityModel, organizationId, userId } = input;

    for (let attempt = 0; attempt < ADD_VOTE_MAX_ATTEMPTS; attempt++) {
      // tenant-scope-ignore: platformOrTenantScope limits the lookup to the caller's organization (or the active tenant) plus the caller's own legacy null-org votes; the filter always carries the caller's userId
      const active = await this.prisma.vote.findFirst({
        orderBy: { createdAt: 'asc' },
        where: {
          entityId,
          isDeleted: false,
          userId,
          ...platformOrTenantScope(organizationId),
        },
      });
      if (active) {
        return {
          created: false,
          vote: this.normalizeDocument(active),
        };
      }

      // tenant-scope-ignore: platformOrTenantScope limits the lookup to the caller's organization (or the active tenant) plus the caller's own legacy null-org votes; the filter always carries the caller's userId
      const removed = await this.prisma.vote.findFirst({
        orderBy: { createdAt: 'desc' },
        where: {
          entityId,
          isDeleted: true,
          userId,
          ...platformOrTenantScope(organizationId),
        },
        select: { id: true },
      });

      try {
        if (removed) {
          // tenant-scope-ignore: platformOrTenantScope limits the lookup to the caller's organization (or the active tenant) plus the caller's own legacy null-org votes; the filter always carries the caller's userId
          const revived = await this.prisma.vote.update({
            data: {
              isDeleted: false,
              ...(organizationId ? { organizationId } : {}),
            },
            where: { id: removed.id, ...platformOrTenantScope(organizationId) },
          });
          return { created: true, vote: this.normalizeDocument(revived) };
        }

        const vote = await this.create({
          entityId,
          entityModel,
          ...(organizationId ? { organizationId } : {}),
          userId,
        } as unknown as CreateVoteDto);
        return { created: true, vote };
      } catch (error: unknown) {
        // A concurrent add won the unique index; loop to read its row.
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }
      }
    }

    throw new ConflictException('Vote could not be recorded; retry');
  }

  /**
   * Remove (soft delete) a user's vote on an entity. Idempotent: removing a
   * vote that is not there is a no-op. Legacy votes written without an
   * organization are removed too, since the filter is always the caller's
   * own `userId`.
   */
  async removeVote(input: {
    entityId: string;
    organizationId?: string;
    userId: string;
  }): Promise<{ removedCount: number }> {
    const { entityId, organizationId, userId } = input;
    const { modifiedCount } = await this.patchAll(
      { entityId, userId, ...platformOrTenantScope(organizationId) },
      { isDeleted: true },
    );
    return { removedCount: modifiedCount };
  }
}
