import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import type {
  AgentStrategyPerformanceSnapshot,
  ExecuteRunResult,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { AgentStrategyAutopilotExecutionService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-execution.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyAutopilotPlanningService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-planning.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyWorkflowRunService } from '@api/collections/agent-strategies/services/agent-strategy-workflow-run.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export type {
  AgentStrategyPerformanceSnapshot,
  BudgetPacingState,
  PublishGateResult,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';

@Injectable()
export class AgentStrategyAutopilotService {
  constructor(
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly performanceService: AgentStrategyAutopilotPerformanceService,
    private readonly planningService: AgentStrategyAutopilotPlanningService,
    private readonly executionService: AgentStrategyAutopilotExecutionService,
    @Optional()
    private readonly workflowRunService?: AgentStrategyWorkflowRunService,
    @Optional()
    private readonly logger?: LoggerService,
  ) {}

  async listStrategyOpportunities(
    strategyIdValue: string,
    organizationId: string,
  ): Promise<AgentStrategyOpportunityDocument[]> {
    const strategy = await this.requireStrategy(
      strategyIdValue,
      organizationId,
    );
    return this.planningService.refreshOpportunities(strategy);
  }

  getPerformanceSnapshot(
    strategyIdValue: string,
    organizationId: string,
  ): Promise<AgentStrategyPerformanceSnapshot> {
    return this.performanceService.getPerformanceSnapshot(
      strategyIdValue,
      organizationId,
    );
  }

  generateStrategyReport(
    strategyIdValue: string,
    organizationId: string,
    reportType: AgentStrategyReportType = 'daily',
  ) {
    return this.performanceService.generateStrategyReport(
      strategyIdValue,
      organizationId,
      reportType,
    );
  }

  async executeQueuedRun(input: {
    defaultModel?: string;
    organizationId: string;
    runId: string;
    strategyId: string;
    userId: string;
  }): Promise<ExecuteRunResult> {
    const strategy = await this.requireStrategy(
      input.strategyId,
      input.organizationId,
    );

    // Prefer bound deterministic workflow when the strategy has a workflow pin.
    const preferredWorkflowId =
      typeof strategy.preferredWorkflowId === 'string'
        ? strategy.preferredWorkflowId.trim()
        : '';
    const preferredTemplateId =
      typeof strategy.preferredWorkflowTemplateId === 'string'
        ? strategy.preferredWorkflowTemplateId.trim()
        : '';

    if (
      this.workflowRunService &&
      (preferredWorkflowId || preferredTemplateId)
    ) {
      try {
        const topic =
          Array.isArray(strategy.topics) && strategy.topics[0]
            ? String(strategy.topics[0])
            : strategy.label;
        const workflowResult = await this.workflowRunService.run(
          input.strategyId,
          input.organizationId,
          input.userId,
          { topic: topic || undefined },
        );
        return {
          contentGenerated: 1,
          creditsUsed: 0,
          summary: `Workflow-backed autopilot started execution ${workflowResult.executionId} on workflow ${workflowResult.workflowId}.`,
        };
      } catch (error) {
        // Fall through to skill/opportunity path if workflow fill fails.
        this.logger?.warn('Workflow-backed autopilot failed; using skills', {
          error,
          strategyId: input.strategyId,
        });
      }
    }

    const pacing = this.planningService.computeBudgetPacingState(strategy);

    await this.opportunitiesService.expireStaleOpportunities(strategy);
    const opportunities =
      await this.planningService.refreshOpportunities(strategy);
    const selected = this.planningService.selectOpportunities(
      strategy,
      opportunities,
      pacing,
    );

    if (selected.length === 0) {
      return {
        contentGenerated: 0,
        creditsUsed: 0,
        summary:
          'No autopilot opportunities were selected because pacing or policy constraints blocked execution.',
      };
    }

    let generatedCount = 0;
    let creditsUsed = 0;
    for (const opportunity of selected) {
      const result = await this.executionService.executeOpportunity(
        strategy,
        opportunity,
        input.userId,
        input.defaultModel,
      );
      generatedCount += result.contentGenerated;
      creditsUsed += result.creditsUsed;
    }

    await this.agentStrategiesService.patch(input.strategyId, {
      expectedSpendToDate: pacing.expectedSpendToDate,
      monthToDateCreditsUsed:
        (strategy.monthToDateCreditsUsed ?? 0) + creditsUsed,
      reserveTrendBudgetRemaining: Math.max(
        0,
        pacing.reserveTrendBudgetRemaining -
          selected
            .filter((item) => item.sourceType === 'trend')
            .reduce((sum, item) => sum + item.estimatedCreditCost, 0),
      ),
    } as unknown as Parameters<AgentStrategiesService['patch']>[1]);

    const reportType: AgentStrategyReportType = strategy.reportingPolicy
      ?.dailyDigestEnabled
      ? 'daily'
      : 'weekly';
    await this.performanceService.generateStrategyReport(
      input.strategyId,
      input.organizationId,
      reportType,
    );

    return {
      contentGenerated: generatedCount,
      creditsUsed,
      summary: `Autopilot processed ${selected.length} opportunities and generated ${generatedCount} content items.`,
    };
  }

  private async requireStrategy(
    strategyIdValue: string,
    organizationId: string,
  ): Promise<AgentStrategyDocument> {
    const strategy = await this.agentStrategiesService.findOneById(
      strategyIdValue,
      organizationId,
    );
    if (!strategy) {
      throw new NotFoundException('Strategy');
    }
    return strategy;
  }
}
