import { CreateAgentGoalDto } from '@api/collections/agent-goals/dto/create-agent-goal.dto';
import { UpdateAgentGoalDto } from '@api/collections/agent-goals/dto/update-agent-goal.dto';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import type {
  AgentMemoryContentType,
  AgentMemoryKind,
  AgentMemoryScope,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class AgentMemoryGoalsToolHandler {
  constructor(
    @Optional()
    private readonly agentMemoryCaptureService: AgentMemoryCaptureService,
    @Optional()
    private readonly agentGoalsService: AgentGoalsService,
  ) {}

  async captureMemory(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentMemoryCaptureService) {
      return {
        creditsUsed: 0,
        error: 'Memory capture is not available in this environment.',
        success: false,
      };
    }

    const content = String(params.content || '').trim();
    if (!content) {
      return {
        creditsUsed: 0,
        error: 'Memory capture requires content.',
        success: false,
      };
    }

    const brandId =
      typeof params.brandId === 'string' ? params.brandId : undefined;
    const campaignId =
      typeof params.campaignId === 'string' ? params.campaignId : undefined;
    const summary =
      typeof params.summary === 'string' ? params.summary.trim() : undefined;
    const capture = await this.agentMemoryCaptureService.capture(
      ctx.userId,
      ctx.organizationId,
      {
        brandId,
        campaignId,
        confidence:
          typeof params.confidence === 'number' ? params.confidence : undefined,
        content,
        contentType: this.normalizeAgentMemoryContentType(params.contentType),
        importance:
          typeof params.importance === 'number' ? params.importance : undefined,
        kind: this.normalizeAgentMemoryKind(params.kind),
        performanceSnapshot:
          params.performanceSnapshot &&
          typeof params.performanceSnapshot === 'object'
            ? (params.performanceSnapshot as Record<string, unknown>)
            : undefined,
        platform:
          typeof params.platform === 'string' ? params.platform : undefined,
        saveToContextMemory: params.saveToContextMemory === true,
        scope: this.normalizeAgentMemoryScope(params.scope),
        sourceContentId:
          typeof params.sourceContentId === 'string'
            ? params.sourceContentId
            : undefined,
        sourceMessageId:
          typeof params.sourceMessageId === 'string'
            ? params.sourceMessageId
            : undefined,
        sourceType:
          typeof params.sourceType === 'string'
            ? params.sourceType
            : 'agent-save',
        sourceUrl:
          typeof params.sourceUrl === 'string' ? params.sourceUrl : undefined,
        summary,
        tags: Array.isArray(params.tags)
          ? params.tags.filter((tag): tag is string => typeof tag === 'string')
          : undefined,
      },
    );

    const memory = capture.memory;
    const destinations = ['agent memory'];
    if (capture.wroteContextMemory) {
      destinations.push('content memory');
    }
    if (capture.wroteBrandInsight) {
      destinations.push('brand insights');
    }

    return {
      creditsUsed: 0,
      data: {
        contentType: memory.contentType,
        destinations,
        id: String(memory.id),
        kind: memory.kind,
        scope: memory.scope,
        summary: memory.summary || summary || content.slice(0, 180),
      },
      success: true,
    };
  }

  async createGoal(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentGoalsService) {
      return {
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      };
    }

    const label = String(params.label || '').trim();
    const metric = String(params.metric || '').trim();
    const targetValue = Number(params.targetValue);

    if (!label || !metric || !Number.isFinite(targetValue)) {
      return {
        creditsUsed: 0,
        error: 'create_goal requires label, metric, and numeric targetValue.',
        success: false,
      };
    }

    const dto: CreateAgentGoalDto = {
      brand: typeof params.brandId === 'string' ? params.brandId : undefined,
      description:
        typeof params.description === 'string'
          ? params.description.trim()
          : undefined,
      endDate:
        typeof params.endDate === 'string'
          ? new Date(params.endDate)
          : undefined,
      isActive:
        typeof params.isActive === 'boolean' ? params.isActive : undefined,
      label,
      metric: metric as CreateAgentGoalDto['metric'],
      startDate:
        typeof params.startDate === 'string'
          ? new Date(params.startDate)
          : undefined,
      targetValue,
    };

    const goal = await this.agentGoalsService.create(
      dto,
      ctx.organizationId,
      ctx.userId,
    );

    return {
      creditsUsed: 0,
      data: {
        currentValue: goal.currentValue,
        goalId: String(goal.id),
        label: goal.label,
        metric: goal.metric,
        progressPercent: goal.progressPercent,
        targetValue: goal.targetValue,
      },
      success: true,
    };
  }

  async checkGoalProgress(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentGoalsService) {
      return {
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      };
    }

    const goalId = String(params.goalId || '').trim();
    if (!EntityIdUtil.isValid(goalId)) {
      return {
        creditsUsed: 0,
        error: 'check_goal_progress requires a valid goalId.',
        success: false,
      };
    }

    const goal = await this.agentGoalsService.refreshProgress(
      goalId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        currentValue: goal.currentValue,
        goalId: String(goal.id),
        label: goal.label,
        metric: goal.metric,
        progressPercent: goal.progressPercent,
        targetValue: goal.targetValue,
      },
      success: true,
    };
  }

  async updateGoal(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.agentGoalsService) {
      return {
        creditsUsed: 0,
        error: 'Agent goals are not available in this environment.',
        success: false,
      };
    }

    const goalId = String(params.goalId || '').trim();
    if (!EntityIdUtil.isValid(goalId)) {
      return {
        creditsUsed: 0,
        error: 'update_goal requires a valid goalId.',
        success: false,
      };
    }

    const dto: UpdateAgentGoalDto = {
      description:
        typeof params.description === 'string'
          ? params.description.trim()
          : undefined,
      endDate:
        typeof params.endDate === 'string'
          ? new Date(params.endDate)
          : undefined,
      isActive:
        typeof params.isActive === 'boolean' ? params.isActive : undefined,
      label: typeof params.label === 'string' ? params.label.trim() : undefined,
      metric:
        typeof params.metric === 'string'
          ? (params.metric as UpdateAgentGoalDto['metric'])
          : undefined,
      startDate:
        typeof params.startDate === 'string'
          ? new Date(params.startDate)
          : undefined,
      targetValue:
        typeof params.targetValue === 'number' ? params.targetValue : undefined,
    };

    const goal = await this.agentGoalsService.update(
      goalId,
      dto,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        currentValue: goal.currentValue,
        goalId: String(goal.id),
        label: goal.label,
        metric: goal.metric,
        progressPercent: goal.progressPercent,
        targetValue: goal.targetValue,
      },
      success: true,
    };
  }

  private normalizeAgentMemoryContentType(
    value: unknown,
  ): AgentMemoryContentType | undefined {
    switch (value) {
      case 'article':
      case 'generic':
      case 'newsletter':
      case 'post':
      case 'thread':
      case 'tweet':
        return value;
      default:
        return undefined;
    }
  }

  private normalizeAgentMemoryKind(
    value: unknown,
  ): AgentMemoryKind | undefined {
    switch (value) {
      case 'instruction':
      case 'negative_example':
      case 'pattern':
      case 'positive_example':
      case 'preference':
      case 'reference':
      case 'winner':
        return value;
      default:
        return undefined;
    }
  }

  private normalizeAgentMemoryScope(
    value: unknown,
  ): AgentMemoryScope | undefined {
    switch (value) {
      case 'brand':
      case 'campaign':
      case 'user':
        return value;
      default:
        return undefined;
    }
  }
}
