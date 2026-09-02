import { TrendsService } from '@api/collections/trends/services/trends.service';
import type {
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import {
  type WorkflowDocumentShape,
  WorkflowEngineConverterService,
} from '@api/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowEngineExecutorRegistryService } from '@api/collections/workflows/services/workflow-engine-executor-registry.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionOptions,
  ExecutionRunResult,
  NodeExecutor,
} from '@genfeedai/workflows/engine';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Bridges NestJS services with the pure workflow-engine package.
 *
 * The adapter owns the engine instance and public execution/conversion API.
 * Executor registration is delegated to cohesive API-local registrar services.
 */
@Injectable()
export class WorkflowEngineAdapterService {
  private readonly logContext = 'WorkflowEngineAdapterService';
  private readonly engine: WorkflowEngine;
  private readonly converter = new WorkflowEngineConverterService();

  constructor(
    private readonly loggerService: LoggerService,
    registry: WorkflowEngineExecutorRegistryService,
    private readonly trendPublishRegistrar: WorkflowTrendPublishExecutorRegistrarService,
  ) {
    this.engine = new WorkflowEngine({ maxConcurrency: 3 });
    registry.register(this.engine);
  }

  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    this.engine.registerExecutor(nodeType, executor);
    this.loggerService.debug(
      `${this.logContext} registered executor for ${nodeType}`,
    );
  }

  getRegisteredActionIds(): string[] {
    return this.engine.getRegisteredActionIds();
  }

  convertToExecutableWorkflow(
    workflowDoc: WorkflowDocumentShape,
  ): ExecutableWorkflow {
    return this.converter.convertToExecutableWorkflow(workflowDoc);
  }

  applyRuntimeInputValues(
    workflowDoc: {
      inputVariables?: WorkflowInputVariable[];
      nodes?: WorkflowVisualNode[];
    },
    executableWorkflow: ExecutableWorkflow,
    inputValues: Record<string, unknown> = {},
  ): ExecutableWorkflow {
    return this.converter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      inputValues,
    );
  }

  async executeWorkflow(
    workflow: ExecutableWorkflow,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    this.loggerService.log(`${this.logContext} executing workflow`, {
      nodeIds: options.nodeIds,
      workflowId: workflow.id,
    });
    const result = await this.engine.execute(workflow, options);
    this.loggerService.log(`${this.logContext} workflow execution completed`, {
      completedAt: result.completedAt,
      status: result.status,
      totalCreditsUsed: result.totalCreditsUsed,
      workflowId: workflow.id,
    });
    return result;
  }

  resumeWorkflow(
    workflow: ExecutableWorkflow,
    previousRunResult: ExecutionRunResult,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    this.loggerService.log(`${this.logContext} resuming workflow`, {
      workflowId: workflow.id,
    });
    return this.engine.resume(workflow, previousRunResult, options);
  }

  estimateCredits(nodes: ExecutableNode[]): number {
    return this.engine.estimateCredits(nodes);
  }

  applyScheduledDigestCharge(
    workflowId: string,
    summaries: Array<{ nodeType: string; output?: Record<string, unknown> }>,
  ): Promise<void> {
    return this.trendPublishRegistrar.applyScheduledDigestCharge(
      workflowId,
      summaries,
    );
  }

  buildDigestTrends(
    trends: TrendsService,
    topN: number,
    minViralScore: number,
    platforms: string[],
  ) {
    return this.trendPublishRegistrar.buildDigestTrends(
      trends,
      topN,
      minViralScore,
      platforms,
    );
  }
}
