import { CreateProjectDto } from '@api/collections/projects/dto/create-project.dto';
import { UpdateProjectDto } from '@api/collections/projects/dto/update-project.dto';
import {
  Project,
  type ProjectDocument,
} from '@api/collections/projects/schemas/project.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ProjectsService extends BaseService<
  ProjectDocument,
  CreateProjectDto,
  UpdateProjectDto
> {
  constructor(
    @InjectModel(Project.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<ProjectDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  override async create(createDto: CreateProjectDto): Promise<ProjectDocument> {
    return super.create(createDto);
  }

  override async findOne(
    params: Record<string, unknown>,
  ): Promise<ProjectDocument | null> {
    return super.findOne(params);
  }

  override async patch(
    id: string,
    updateDto: UpdateProjectDto | Record<string, unknown>,
  ): Promise<ProjectDocument> {
    return super.patch(id, updateDto);
  }
}
