import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { UpdateVoteDto } from '@api/collections/votes/dto/update-vote.dto';
import type { VoteDocument } from '@api/collections/votes/schemas/vote.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { VoteEntityModel } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VotesService extends BaseService<
  VoteDocument,
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
   * Toggle a user's vote on an entity: remove the active vote if there is one,
   * otherwise record a new one stamped with the tenant. The caller must already
   * have verified that `entityId` belongs to `organizationId`. Return the vote
   * document as well so HTTP callers can use the standard vote serializer.
   */
  async toggleVote(input: {
    entityId: string;
    entityModel: VoteEntityModel;
    organizationId: string;
    userId: string;
  }): Promise<{
    action: 'added' | 'removed';
    vote: VoteDocument;
    voteId: string;
  }> {
    const { entityId, entityModel, organizationId, userId } = input;
    const existing = await this.findOne({
      entityId,
      entityModel,
      isDeleted: false,
      organizationId,
      userId,
    });

    if (existing) {
      await this.patchAll(
        { entityId, entityModel, isDeleted: false, organizationId, userId },
        { isDeleted: true },
      );
      return {
        action: 'removed',
        vote: { ...existing, isDeleted: true },
        voteId: String(existing.id),
      };
    }

    const vote = await this.create({
      entityId,
      entityModel,
      organizationId,
      userId,
    } as unknown as CreateVoteDto);
    return { action: 'added', vote, voteId: String(vote.id) };
  }
}
