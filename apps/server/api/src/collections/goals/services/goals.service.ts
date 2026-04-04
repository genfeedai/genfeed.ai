import { CreateGoalDto } from '@api/collections/goals/dto/create-goal.dto';
import { UpdateGoalDto } from '@api/collections/goals/dto/update-goal.dto';
import {
  Goal,
  type GoalDocument,
} from '@api/collections/goals/schemas/goal.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class GoalsService extends BaseService<
  GoalDocument,
  CreateGoalDto,
  UpdateGoalDto
> {
  constructor(
    @InjectModel(Goal.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<GoalDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  override async create(createDto: CreateGoalDto): Promise<GoalDocument> {
    return super.create(createDto);
  }

  override async findOne(
    params: Record<string, unknown>,
  ): Promise<GoalDocument | null> {
    return super.findOne(params);
  }

  override async patch(
    id: string,
    updateDto: UpdateGoalDto | Record<string, unknown>,
  ): Promise<GoalDocument> {
    return super.patch(id, updateDto);
  }
}
