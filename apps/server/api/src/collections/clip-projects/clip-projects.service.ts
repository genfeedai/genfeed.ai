import type { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import type { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import {
  ClipProject,
  type ClipProjectDocument,
} from '@api/collections/clip-projects/schemas/clip-project.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ClipProjectsService extends BaseService<
  ClipProjectDocument,
  CreateClipProjectDto,
  UpdateClipProjectDto
> {
  constructor(
    @InjectModel(ClipProject.name, DB_CONNECTIONS.CLIPS)
    protected readonly model: AggregatePaginateModel<ClipProjectDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
