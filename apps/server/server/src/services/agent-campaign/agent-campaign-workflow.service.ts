import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowActionRequest } from '@server/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import {
  AGENT_CAMPAIGN_ACTION_IDS,
  AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS,
  AGENT_CAMPAIGN_WORKFLOW_IDS,
  findAgentCampaignWorkflowDefinition,
} from '@server/services/agent-campaign/agent-campaign-workflow-definition';
import { ContentEngineService } from '@server/services/agent-campaign/content-engine.service';
import { TriggerEvaluatorService } from '@server/services/agent-campaign/trigger-evaluator.service';

export type AgentCampaignWorkflowRequest = {
  campaignId: string;
  organizationId: string;
  scheduledAt?: Date;
  userId: string;
};

@Injectable()
export class AgentCampaignWorkflowService implements OnModuleInit {
  constructor(
    private readonly contentEngine: ContentEngineService,
    private readonly triggerEvaluator: TriggerEvaluatorService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATE,
      (request) => this.orchestrateAction(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.EXTRACT_MEMORY,
      (request) => this.extractMemoryAction(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.EVALUATE_TRIGGERS,
      (request) => this.evaluateTriggersAction(request),
    );
    for (const definition of AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS) {
      this.runner.registerWorkflow(definition);
    }
  }

  queueOrchestration(request: AgentCampaignWorkflowRequest): Promise<string> {
    return this.enqueue(AGENT_CAMPAIGN_WORKFLOW_IDS.ORCHESTRATE, request);
  }

  queueMemoryExtraction(
    request: AgentCampaignWorkflowRequest,
  ): Promise<string> {
    return this.enqueue(AGENT_CAMPAIGN_WORKFLOW_IDS.EXTRACT_MEMORY, request);
  }

  queueTriggerEvaluation(
    request: AgentCampaignWorkflowRequest,
  ): Promise<string> {
    return this.enqueue(AGENT_CAMPAIGN_WORKFLOW_IDS.EVALUATE_TRIGGERS, request);
  }

  private async enqueue(
    canonicalId: string,
    request: AgentCampaignWorkflowRequest,
  ): Promise<string> {
    const definition = findAgentCampaignWorkflowDefinition(canonicalId);
    const kind = canonicalId.split('.').at(-1) ?? 'run';
    const jobId = `agent-campaign-${kind}-${request.campaignId}`;
    const queued = await this.queue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          request: {
            ...request,
            scheduledAt: (request.scheduledAt ?? new Date()).toISOString(),
          },
        },
        organizationId: request.organizationId,
        source: 'agent-campaign-scheduler',
        userId: request.userId,
      },
      jobId,
      { attempts: 3, replaceTerminalJob: true },
    );
    this.logger.log('Agent campaign workflow queued', {
      campaignId: request.campaignId,
      canonicalId,
      jobId: queued,
      organizationId: request.organizationId,
    });
    return queued;
  }

  private orchestrateAction(request: SystemWorkflowActionRequest) {
    const input = this.readRequest(request);
    return this.contentEngine.runOrchestrationCycle(
      input.campaignId,
      input.organizationId,
    );
  }

  private extractMemoryAction(request: SystemWorkflowActionRequest) {
    const input = this.readRequest(request);
    return this.contentEngine.extractWinnerPatterns(
      input.campaignId,
      input.organizationId,
    );
  }

  private evaluateTriggersAction(request: SystemWorkflowActionRequest) {
    const input = this.readRequest(request);
    return this.triggerEvaluator.evaluateCampaign(
      input.campaignId,
      input.organizationId,
    );
  }

  private readRequest(
    action: SystemWorkflowActionRequest,
  ): AgentCampaignWorkflowRequest {
    const input = action.input.request;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Agent campaign workflow requires request');
    }
    const record = input as Record<string, unknown>;
    const organizationId = this.requiredString(
      record.organizationId,
      'organizationId',
    );
    if (organizationId !== action.context.organizationId) {
      throw new Error('Agent campaign workflow organization mismatch');
    }
    return {
      campaignId: this.requiredString(record.campaignId, 'campaignId'),
      organizationId,
      userId: this.requiredString(record.userId, 'userId'),
    };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Agent campaign workflow requires ${field}`);
    }
    return value.trim();
  }
}
