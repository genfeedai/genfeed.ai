import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import type { UpdateClipResultDto } from '@api/collections/clip-results/dto/update-clip-result.dto';
import {
  ClipResult,
  type ClipResultDocument,
} from '@api/collections/clip-results/schemas/clip-result.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class ClipResultsService extends BaseService<
  ClipResultDocument,
  CreateClipResultDto,
  UpdateClipResultDto
> {
  constructor(
    @InjectModel(ClipResult.name, DB_CONNECTIONS.CLIPS)
    protected readonly model: AggregatePaginateModel<ClipResultDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  findByProject(projectId: string): Promise<ClipResultDocument[]> {
    return this.model
      .find({
        isDeleted: false,
        project: new Types.ObjectId(projectId),
      })
      .sort({ viralityScore: -1 })
      .exec();
  }

  findByProviderJobId(
    providerJobId: string,
  ): Promise<ClipResultDocument | null> {
    return this.model
      .findOne({
        isDeleted: false,
        providerJobId,
      })
      .exec();
  }
}
