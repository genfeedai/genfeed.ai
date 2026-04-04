import { CreateGoalDto } from '@api/collections/goals/dto/create-goal.dto';
import { GoalQueryDto } from '@api/collections/goals/dto/goal-query.dto';
import { UpdateGoalDto } from '@api/collections/goals/dto/update-goal.dto';
import {
  Goal,
  type GoalDocument,
} from '@api/collections/goals/schemas/goal.schema';
import { GoalsService } from '@api/collections/goals/services/goals.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { GoalSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

@ApiTags('Goals')
@AutoSwagger()
@Controller('v1/goals')
export class GoalsController extends BaseCRUDController<
  GoalDocument,
  CreateGoalDto,
  UpdateGoalDto,
  GoalQueryDto
> {
  constructor(
    public readonly loggerService: LoggerService,
    private readonly goalsService: GoalsService,
  ) {
    super(loggerService, goalsService, GoalSerializer, Goal.name);
  }

  @Post()
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateGoalDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const doc = await this.goalsService.create({
      ...createDto,
      organization: new Types.ObjectId(organizationId),
    } as CreateGoalDto & {
      organization: Types.ObjectId;
    });

    return serializeSingle(request, GoalSerializer, doc);
  }

  public override buildFindAllPipeline(
    user: User,
    query: GoalQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organization: new Types.ObjectId(publicMetadata.organization),
    };

    if (query.status) {
      match.status = query.status;
    }

    if (query.level) {
      match.level = query.level;
    }

    const sort = handleQuerySort(query.sort);

    return [{ $match: match }, { $sort: sort }];
  }

  public override canUserModifyEntity(
    user: User,
    entity: GoalDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);
    const entityOrganizationId =
      (
        entity.organization as unknown as { _id?: Types.ObjectId }
      )?._id?.toString() || entity.organization?.toString();

    return entityOrganizationId === publicMetadata.organization;
  }

  @Patch(':id')
  override async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateGoalDto,
  ): Promise<JsonApiSingleResponse> {
    return super.patch(request, user, id, updateDto);
  }
}
