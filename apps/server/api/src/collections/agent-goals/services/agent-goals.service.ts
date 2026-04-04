import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import {
  AgentGoal,
  type AgentGoalDocument,
  type AgentGoalMetric,
} from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

interface AnalyticsOverview {
  avgEngagementRate: number;
  totalPosts: number;
  totalViews: number;
}

@Injectable()
export class AgentGoalsService {
  constructor(
    @InjectModel(AgentGoal.name, DB_CONNECTIONS.AGENT)
    private readonly agentGoalModel: Model<AgentGoalDocument>,
    private readonly analyticsService: AnalyticsService,
    private readonly loggerService: LoggerService,
  ) {}

  async create(
    dto: CreateAgentGoalDto,
    organizationId: string,
    userId: string,
  ): Promise<AgentGoalDocument> {
    this.validateMetricTarget(dto.metric, dto.targetValue);

    const goal = await this.agentGoalModel.create({
      ...dto,
      organization: new Types.ObjectId(organizationId),
      user: new Types.ObjectId(userId),
    });

    return this.refreshProgress(String(goal._id), organizationId);
  }

  async list(
    organizationId: string,
    brandId?: string,
  ): Promise<AgentGoalDocument[]> {
    return this.agentGoalModel
      .find({
        ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(
    goalId: string,
    dto: UpdateAgentGoalDto,
    organizationId: string,
  ): Promise<AgentGoalDocument> {
    const goal = await this.agentGoalModel.findOne({
      _id: new Types.ObjectId(goalId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!goal) {
      throw new NotFoundException(`Agent goal ${goalId} not found`);
    }

    this.validateMetricTarget(
      dto.metric ?? goal.metric,
      dto.targetValue ?? goal.targetValue,
    );

    await this.agentGoalModel
      .updateOne({ _id: goal._id }, { $set: dto })
      .exec();
    return this.refreshProgress(goalId, organizationId);
  }

  async refreshProgress(
    goalId: string,
    organizationId: string,
  ): Promise<AgentGoalDocument> {
    const goal = await this.agentGoalModel.findOne({
      _id: new Types.ObjectId(goalId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!goal) {
      throw new NotFoundException(`Agent goal ${goalId} not found`);
    }

    const overview = (await this.analyticsService.getOverview(
      goal.startDate?.toISOString(),
      goal.endDate?.toISOString(),
      goal.brand ? String(goal.brand) : undefined,
      organizationId,
    )) as AnalyticsOverview;

    const currentValue = this.resolveMetricValue(goal.metric, overview);
    const progressPercent =
      goal.targetValue > 0
        ? Math.min(
            100,
            Number(((currentValue / goal.targetValue) * 100).toFixed(2)),
          )
        : 0;

    await this.agentGoalModel
      .updateOne(
        { _id: goal._id },
        {
          $set: {
            currentValue,
            lastEvaluatedAt: new Date(),
            progressPercent,
          },
        },
      )
      .exec();

    const updatedGoal = await this.agentGoalModel.findById(goal._id).exec();
    if (!updatedGoal) {
      throw new NotFoundException(
        `Agent goal ${goalId} not found after update`,
      );
    }

    return updatedGoal;
  }

  async getGoalSummary(
    goalId: string,
    organizationId: string,
  ): Promise<string> {
    const goal = await this.refreshProgress(goalId, organizationId);
    return `Goal "${goal.label}": ${goal.currentValue}/${goal.targetValue} ${goal.metric} (${goal.progressPercent}% complete).`;
  }

  private resolveMetricValue(
    metric: AgentGoalMetric,
    overview: AnalyticsOverview,
  ): number {
    switch (metric) {
      case 'engagement_rate':
        return Number((overview.avgEngagementRate || 0).toFixed(2));
      case 'posts':
        return overview.totalPosts || 0;
      case 'views':
        return overview.totalViews || 0;
      default:
        this.loggerService.warn(`Unknown goal metric: ${metric}`);
        return 0;
    }
  }

  private validateMetricTarget(
    metric: AgentGoalMetric,
    targetValue: number,
  ): void {
    if (!Number.isFinite(targetValue) || targetValue < 0) {
      throw new BadRequestException(
        `Target value for ${metric} must be a non-negative number`,
      );
    }
  }
}
