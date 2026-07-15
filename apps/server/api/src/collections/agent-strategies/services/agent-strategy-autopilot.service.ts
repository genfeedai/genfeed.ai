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
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { Injectable } from '@nestjs/common';

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
      monthToDateCreditsUsed: strategy.monthToDateCreditsUsed + creditsUsed,
      reserveTrendBudgetRemaining: Math.max(
        0,
        pacing.reserveTrendBudgetRemaining -
          selected
            .filter((item) => item.sourceType === 'trend')
            .reduce((sum, item) => sum + item.estimatedCreditCost, 0),
      ),
    } as never);

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
