import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import type { AgentGoalMetric } from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  findOrThrow,
  findUniqueOrThrow,
} from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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

    // Map dto.brand -> brandId; move non-Prisma domain fields into config
    const brandId = dto.brand ?? undefined;
    const config = this.buildGoalConfig(dto);

    const goal = await this.prisma.agentGoal.create({
      data: {
        brandId: brandId ?? null,
        config,
        description: dto.description,
        isDeleted: false,
        label: dto.label,
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
    const goal = await findOrThrow(
      this.prisma.agentGoal,
      { where: { id: goalId, isDeleted: false, organizationId } },
      'Agent goal',
      goalId,
    );

    const existingConfig = this.readConfig(goal);

    // Resolve effective metric/targetValue (dto overrides existing config)
    const effectiveMetric = (dto.metric ??
      existingConfig.metric) as AgentGoalMetric;
    const effectiveTargetValue = (dto.targetValue ??
      existingConfig.targetValue) as number;

    this.validateMetricTarget(effectiveMetric, effectiveTargetValue);

    const patchConfig = this.buildGoalConfig(
      dto as Partial<CreateAgentGoalDto>,
    );
    const mergedConfig: Record<string, unknown> = { ...existingConfig };
    for (const [key, value] of Object.entries(patchConfig)) {
      if (value !== undefined) {
        mergedConfig[key] = value;
      }
    }

    const prismaData: Record<string, unknown> = { config: mergedConfig };
    if (dto.label !== undefined) {
      prismaData.label = dto.label;
    }
    if (dto.description !== undefined) {
      prismaData.description = dto.description;
    }
    if ((dto as Record<string, unknown>).brand !== undefined) {
      prismaData.brandId = (dto as Record<string, unknown>).brand ?? null;
    }

    await this.prisma.agentGoal.update({
      data: prismaData as never,
      where: { id: goalId },
    });
    return this.refreshProgress(goalId, organizationId);
  }

  async refreshProgress(
    goalId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const goal = await findOrThrow(
      this.prisma.agentGoal,
      { where: { id: goalId, isDeleted: false, organizationId } },
      'Agent goal',
      goalId,
    );

    // Domain fields live in config
    const config = this.readConfig(goal);

    const overview = (await this.analyticsService.getOverview(
      config.startDate as string | undefined,
      config.endDate as string | undefined,
      (goal as Record<string, unknown>).brandId as string | undefined,
      organizationId,
    )) as AnalyticsOverview;

    const currentValue = this.resolveMetricValue(
      config.metric as AgentGoalMetric,
      overview,
    );
    const targetValue = config.targetValue as number;
    const progressPercent =
      targetValue > 0
        ? Math.min(100, Number(((currentValue / targetValue) * 100).toFixed(2)))
        : 0;

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

    const updatedGoal = await findUniqueOrThrow(
      this.prisma.agentGoal,
      { where: { id: goalId } },
      'Agent goal not found after update',
    );

    // Merge config fields into the returned record for callers
    const updatedConfig = this.readConfig(updatedGoal);
    return { ...(updatedGoal as Record<string, unknown>), ...updatedConfig };
  }

  async getGoalSummary(
    goalId: string,
    organizationId: string,
  ): Promise<string> {
    const goal = await this.refreshProgress(goalId, organizationId);
    // Fields now available at top level (merged from config in refreshProgress)
    return `Goal "${goal.label as string}": ${goal.currentValue as number}/${goal.targetValue as number} ${goal.metric as string} (${goal.progressPercent as number}% complete).`;
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

  /**
   * Extract non-Prisma domain fields from a DTO into the config JSON column.
   */
  private buildGoalConfig(
    dto: Partial<CreateAgentGoalDto>,
  ): Record<string, unknown> {
    return {
      endDate:
        dto.endDate?.toISOString() ??
        (dto.endDate as unknown as string | undefined),
      isActive: dto.isActive,
      metric: dto.metric,
      startDate:
        dto.startDate?.toISOString() ??
        (dto.startDate as unknown as string | undefined),
      targetValue: dto.targetValue,
    };
  }

  private readConfig(row: unknown): Record<string, unknown> {
    const r = row as Record<string, unknown>;
    if (r.config && typeof r.config === 'object' && !Array.isArray(r.config)) {
      return r.config as Record<string, unknown>;
    }
    return {};
  }
}
