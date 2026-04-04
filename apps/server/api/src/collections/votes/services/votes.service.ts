import { CreateVoteDto } from '@api/collections/votes/dto/create-vote.dto';
import { UpdateVoteDto } from '@api/collections/votes/dto/update-vote.dto';
import {
  Vote,
  type VoteDocument,
} from '@api/collections/votes/schemas/vote.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class VotesService extends BaseService<
  VoteDocument,
  CreateVoteDto,
  UpdateVoteDto
> {
  constructor(
    @InjectModel(Vote.name, DB_CONNECTIONS.CLOUD)
    model: Model<VoteDocument>,
    logger: LoggerService,
  ) {
    super(model as AggregatePaginateModel<VoteDocument>, logger);
  }
}
