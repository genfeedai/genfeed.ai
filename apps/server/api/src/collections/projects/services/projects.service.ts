import { CreateProjectDto } from '@api/collections/projects/dto/create-project.dto';
import { UpdateProjectDto } from '@api/collections/projects/dto/update-project.dto';
import type { ProjectDocument } from '@api/collections/projects/schemas/project.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProjectsService extends BaseService<
  ProjectDocument,
  CreateProjectDto,
  UpdateProjectDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
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
