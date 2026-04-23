import { CreateProjectDto } from '@api/collections/projects/dto/create-project.dto';
import { ProjectQueryDto } from '@api/collections/projects/dto/project-query.dto';
import { UpdateProjectDto } from '@api/collections/projects/dto/update-project.dto';
import {
  Project,
  type ProjectDocument,
} from '@api/collections/projects/schemas/project.schema';
import { ProjectsService } from '@api/collections/projects/services/projects.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { ProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Projects')
@AutoSwagger()
@Controller('v1/projects')
export class ProjectsController extends BaseCRUDController<
  ProjectDocument,
  CreateProjectDto,
  UpdateProjectDto,
  ProjectQueryDto
> {
  constructor(
    public readonly loggerService: LoggerService,
    private readonly projectsService: ProjectsService,
  ) {
    super(loggerService, projectsService, ProjectSerializer, 'Project');
  }

  @Post()
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const doc = await this.projectsService.create({
      ...createDto,
      organization: organizationId,
    } as CreateProjectDto & {
      organization: string;
    });

    return serializeSingle(request, ProjectSerializer, doc);
  }

  public override buildFindAllPipeline(
    user: User,
    query: ProjectQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organization: publicMetadata.organization,
    };

    if (query.status) {
      match.status = query.status;
    }

    const sort = handleQuerySort(query.sort);

    return [{ $match: match }, { $sort: sort }];
  }

  public override canUserModifyEntity(
    user: User,
    entity: ProjectDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);
    const entityOrganizationId = entity.organizationId?.toString();

    return entityOrganizationId === publicMetadata.organization;
  }

  @Patch(':id')
  override async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateProjectDto,
  ): Promise<JsonApiSingleResponse> {
    return super.patch(request, user, id, updateDto);
  }
}
