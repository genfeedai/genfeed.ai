import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import type { AgentGoalMetric } from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

interface AnalyticsOverview {
  avgEngagementRate: number;
  totalPosts: number;
  totalViews: number;
}

@Injectable()
export class AgentGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly loggerService: LoggerService,
  ) {}

  async create(
    dto: CreateAgentGoalDto,
    organizationId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    this.validateMetricTarget(dto.metric, dto.targetValue);

    const goal = await this.prisma.agentGoal.create({
      data: {
        ...dto,
        organizationId,
        userId,
      } as never,
    });

    return this.refreshProgress(goal.id, organizationId);
  }

  async list(
    organizationId: string,
    brandId?: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.agentGoal.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
      },
    });
  }

  async update(
    goalId: string,
    dto: UpdateAgentGoalDto,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const goal = await this.prisma.agentGoal.findFirst({
      where: { id: goalId, isDeleted: false, organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Agent goal ${goalId} not found`);
    }

    this.validateMetricTarget(
      (dto.metric ??
        (goal as Record<string, unknown>).metric) as AgentGoalMetric,
      (dto.targetValue ??
        (goal as Record<string, unknown>).targetValue) as number,
    );

    await this.prisma.agentGoal.update({
      data: dto as never,
      where: { id: goalId },
    });
    return this.refreshProgress(goalId, organizationId);
  }

  async refreshProgress(
    goalId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const goal = await this.prisma.agentGoal.findFirst({
      where: { id: goalId, isDeleted: false, organizationId },
    });

    if (!goal) {
      throw new NotFoundException(`Agent goal ${goalId} not found`);
    }

    const g = goal as Record<string, unknown>;

    const overview = (await this.analyticsService.getOverview(
      (g.startDate as Date | undefined)?.toISOString(),
      (g.endDate as Date | undefined)?.toISOString(),
      g.brandId as string | undefined,
      organizationId,
    )) as AnalyticsOverview;

    const currentValue = this.resolveMetricValue(
      g.metric as AgentGoalMetric,
      overview,
    );
    const targetValue = g.targetValue as number;
    const progressPercent =
      targetValue > 0
        ? Math.min(100, Number(((currentValue / targetValue) * 100).toFixed(2)))
        : 0;

    const config =
      goal.config &&
      typeof goal.config === 'object' &&
      !Array.isArray(goal.config)
        ? (goal.config as Record<string, unknown>)
        : {};

    await this.prisma.agentGoal.update({
      data: {
        config: {
          ...config,
          currentValue,
          lastEvaluatedAt: new Date().toISOString(),
          progressPercent,
        } as never,
      },
      where: { id: goalId },
    });

    const updatedGoal = await this.prisma.agentGoal.findUnique({
      where: { id: goalId },
    });
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
    const g = goal as Record<string, unknown>;
    return `Goal "${g.label as string}": ${g.currentValue as number}/${g.targetValue as number} ${g.metric as string} (${g.progressPercent as number}% complete).`;
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
