import { CreateVoteDto } from '@server/collections/votes/dto/create-vote.dto';
import { UpdateVoteDto } from '@server/collections/votes/dto/update-vote.dto';
import type { VoteDocument } from '@server/collections/votes/schemas/vote.schema';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';
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
}
