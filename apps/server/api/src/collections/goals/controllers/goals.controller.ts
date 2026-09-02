import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateGoalDto } from '@api/collections/goals/dto/create-goal.dto';
import { GoalQueryDto } from '@api/collections/goals/dto/goal-query.dto';
import { UpdateGoalDto } from '@api/collections/goals/dto/update-goal.dto';
import type { GoalDocument } from '@api/collections/goals/schemas/goal.schema';
import { GoalsService } from '@api/collections/goals/services/goals.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { GoalSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Goals')
@AutoSwagger()
@Controller('goals')
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
    super(loggerService, goalsService, GoalSerializer, 'Goal');
  }

  @Post()
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateGoalDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = user.organizationId;

    const doc = await this.goalsService.create({
      ...createDto,
      organizationId,
    });

    return serializeSingle(request, GoalSerializer, doc);
  }

  public override buildFindAllQuery(user: User, query: GoalQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organizationId: user.organizationId,
    };

    if (query.status) {
      match.status = query.status;
    }

    if (query.level) {
      match.level = query.level;
    }

    const sort = handleQuerySort(query.sort);

    return {
      orderBy: sort,
      where: match,
    };
  }

  public override canUserModifyEntity(
    user: User,
    entity: GoalDocument,
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
    @Body() updateDto: UpdateGoalDto,
  ): Promise<JsonApiSingleResponse> {
    return super.patch(request, user, id, updateDto);
  }
}
