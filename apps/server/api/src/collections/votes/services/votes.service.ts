import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { UpdateVoteDto } from '@api/collections/votes/dto/update-vote.dto';
import type { VoteDocument } from '@api/collections/votes/schemas/vote.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
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
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }
}
