import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateProjectDto } from '@api/collections/projects/dto/create-project.dto';
import { ProjectQueryDto } from '@api/collections/projects/dto/project-query.dto';
import { UpdateProjectDto } from '@api/collections/projects/dto/update-project.dto';
import type { ProjectDocument } from '@api/collections/projects/schemas/project.schema';
import { ProjectsService } from '@api/collections/projects/services/projects.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { ProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Projects')
@AutoSwagger()
@Controller('projects')
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
    const organizationId = user.organizationId;

    const doc = await this.projectsService.create({
      ...createDto,
      organizationId,
    });

    return serializeSingle(request, ProjectSerializer, doc);
  }

  public override buildFindAllQuery(user: User, query: ProjectQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organizationId: user.organizationId,
    };

    if (query.status) {
      match.status = query.status;
    }

    const sort = handleQuerySort(query.sort);

    return {
      orderBy: sort,
      where: match,
    };
  }

  public override canUserModifyEntity(
    user: User,
    entity: ProjectDocument,
  ): boolean {
    // Both ids must exist: `undefined === undefined` granted write access.
    const userOrgId = user.organizationId;
    return Boolean(userOrgId) && entity.organizationId === userOrgId;
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
