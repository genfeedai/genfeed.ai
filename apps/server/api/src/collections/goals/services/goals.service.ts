import { CreateGoalDto } from '@api/collections/goals/dto/create-goal.dto';
import { UpdateGoalDto } from '@api/collections/goals/dto/update-goal.dto';
import type { GoalDocument } from '@api/collections/goals/schemas/goal.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GoalsService extends BaseService<
  GoalDocument,
  CreateGoalDto,
  UpdateGoalDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'goal', logger);
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
