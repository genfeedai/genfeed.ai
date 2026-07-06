import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { type WorkflowExecutionDocument } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { type WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { CreditEstimate } from '@genfeedai/workflow-engine';
import {
  calculateCreditEstimate,
  DEFAULT_CREDIT_COSTS,
  type ExecutableWorkflow,
  type ExecutionRunResult,
  type NodeStatusChangeEvent,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

/**
 * Run-control surface for node-based workflow executions: partial (subset of
 * nodes) runs, resume-from-failed, credit validation, and execution log
 * retrieval. Split out of `WorkflowsService` (#754).
 */
@Injectable()
export class WorkflowRunControlService {
  constructor(
    private readonly logger: LoggerService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
    @Optional()
    private readonly workflowEngineAdapter?: WorkflowEngineAdapterService,
    @Optional()
    private readonly workflowExecutionsService?: WorkflowExecutionsService,
  ) {}

  /**
   * Execute a partial workflow (subset of nodes)
   */
  @HandleErrors('execute partial workflow', 'workflows')
  async executePartial(
    workflowId: string,
    nodeIds: string[],
    userId: string,
    organizationId: string,
    options: { respectLocks?: boolean; dryRun?: boolean } = {},
  ): Promise<
    | WorkflowExecutionDocument
    | { runId: string; status: string; message: string }
  > {
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    // Validate nodes exist
    const workflowNodeIds = workflow.nodes.map((n) => n.id);
    const invalidNodes = nodeIds.filter((id) => !workflowNodeIds.includes(id));
    if (invalidNodes.length > 0) {
      throw new BadRequestException(
        `Invalid node IDs: ${invalidNodes.join(', ')}`,
      );
    }

    if (options.dryRun) {
      return {
        message: 'Dry run complete - validation passed',
        runId: 'dry-run',
        status: 'validated',
      };
    }

    if (!this.workflowExecutionsService) {
      throw new Error(
        'Workflow executions service is not available - cannot track partial workflow execution',
      );
    }

    const execution = await this.workflowExecutionsService.createExecution(
      userId,
      organizationId,
      {
        inputValues: {},
        metadata: {
          executionMode: 'partial',
          selectedNodeIds: nodeIds,
        },
        trigger: WorkflowExecutionTrigger.MANUAL,
        workflow: workflowId,
      },
    );
    const startedExecution =
      await this.workflowExecutionsService.startExecution(
        execution._id.toString(),
      );
    const runId = execution._id.toString();

    await this.workflowsService.patch(workflowId, {
      status: WorkflowStatus.RUNNING,
    });

    // Start async execution
    this.executePartialAsync(workflowId, runId, nodeIds, options).catch(
      (error) => {
        if (this.logger) {
          this.logger.error('Partial workflow execution failed', error);
        }
      },
    );

    return startedExecution ?? execution;
  }

  /**
   * Internal async execution for partial workflow. Delegates topological
   * execution to `WorkflowEngineAdapterService` and records node/run results
   * on the tracked execution.
   */
  private async executePartialAsync(
    workflowId: string,
    runId: string,
    nodeIds: string[],
    options: { respectLocks?: boolean } = {},
  ): Promise<void> {
    try {
      const workflow = await this.workflowsService.findOne({
        _id: workflowId,
        isDeleted: false,
      });
      if (!workflow) {
        return;
      }

      if (!this.workflowEngineAdapter || !this.workflowExecutionsService) {
        throw new Error(
          'Workflow engine adapter is not available - cannot execute workflow nodes',
        );
      }

      const executableWorkflow =
        this.workflowEngineAdapter.convertToExecutableWorkflow(workflow);
      const totalNodes = nodeIds.length;

      const result = await this.workflowEngineAdapter.executeWorkflow(
        executableWorkflow,
        {
          executionId: runId,
          nodeIds,
          onNodeStatusChange: (event: NodeStatusChangeEvent) =>
            this.recordNodeStatusChange(
              workflowId,
              runId,
              executableWorkflow,
              totalNodes,
              event,
            ),
          onProgress: async (event: { progress: number }) => {
            await this.workflowsService.patch(workflowId, {
              progress: event.progress,
            });
          },
          respectLocks: options.respectLocks,
        },
      );

      await this.recordRunResult(runId, result);

      await this.workflowsService.patch(workflowId, {
        completedAt: new Date(),
        progress: 100,
        status: WorkflowStatus.COMPLETED,
      });
    } catch (error) {
      if (this.workflowExecutionsService) {
        await this.workflowExecutionsService.completeExecution(
          runId,
          (error as Error)?.message ?? 'Unknown error',
        );
      }

      await this.workflowsService.patch(workflowId, {
        completedAt: new Date(),
        status: WorkflowStatus.FAILED,
      });
    }
  }

  private async recordNodeStatusChange(
    workflowId: string,
    runId: string,
    executableWorkflow: ExecutableWorkflow,
    totalNodes: number,
    event: NodeStatusChangeEvent,
  ): Promise<void> {
    const node = executableWorkflow.nodes.find(
      (candidate) => candidate.id === event.nodeId,
    );
    const isTerminalStatus =
      event.newStatus === 'completed' ||
      event.newStatus === 'failed' ||
      event.newStatus === 'skipped';

    await this.workflowExecutionsService?.updateNodeResult(
      runId,
      {
        completedAt: isTerminalStatus ? new Date() : undefined,
        error: event.error,
        nodeId: event.nodeId,
        nodeType: node?.type ?? 'unknown',
        output:
          event.output && typeof event.output === 'object'
            ? (event.output as Record<string, unknown>)
            : undefined,
        progress: this.deriveNodeProgress(event.newStatus),
        startedAt: event.newStatus === 'running' ? new Date() : undefined,
        status: this.mapExecutionNodeStatus(event.newStatus),
      },
      totalNodes,
    );

    await this.emitWorkflowEvent(workflowId, `node-${event.newStatus}`, {
      nodeId: event.nodeId,
      runId,
    });
  }

  private deriveNodeProgress(status: string): number | undefined {
    if (status === 'completed' || status === 'skipped') {
      return 100;
    }
    if (status === 'running') {
      return 0;
    }
    return undefined;
  }

  private async recordRunResult(
    runId: string,
    result: ExecutionRunResult,
  ): Promise<void> {
    await this.workflowExecutionsService?.completeExecution(
      runId,
      result.status === 'failed' ? result.error : undefined,
    );

    if (result.totalCreditsUsed > 0) {
      await this.workflowExecutionsService?.setCreditsUsed(
        runId,
        result.totalCreditsUsed,
      );
    }

    const failedNodeId = this.findFirstFailedNodeId(result);
    if (failedNodeId) {
      await this.workflowExecutionsService?.setFailedNodeId(
        runId,
        failedNodeId,
      );
    }
  }

  /**
   * Resume execution from a failed run
   */
  @HandleErrors('resume workflow execution', 'workflows')
  async resumeFromFailed(
    workflowId: string,
    runId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ runId: string; status: string; message: string }> {
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    // Find the failed execution from the workflow-executions collection
    const failedRun = await this.workflowExecutionsService?.findOne({
      _id: runId,
      isDeleted: false,
      organization: organizationId,
      workflow: workflowId,
    });

    if (!failedRun) {
      throw new NotFoundException('Execution run', runId);
    }

    if (String(failedRun.status) !== WorkflowExecutionStatus.FAILED) {
      throw new BadRequestException(`Run ${runId} is not in failed state`);
    }

    if (!failedRun.failedNodeId) {
      throw new BadRequestException('No failed node ID recorded');
    }

    const resumedExecution = await this.executePartial(
      workflowId,
      [failedRun.failedNodeId],
      userId,
      organizationId,
    );

    if ('runId' in resumedExecution) {
      return {
        message: String(resumedExecution.message),
        runId: String(resumedExecution.runId),
        status: String(resumedExecution.status),
      };
    }

    return {
      message: 'Partial execution started',
      runId: resumedExecution._id.toString(),
      status: resumedExecution.status,
    };
  }

  /**
   * Validate credits for workflow execution
   */
  @HandleErrors('validate credits', 'workflows')
  async validateCredits(
    workflowId: string,
    organizationId: string,
    nodeIds?: string[],
  ): Promise<CreditEstimate> {
    const workflow = await this.workflowsService.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    // Get real organization credit balance
    const availableCredits = this.creditsUtilsService
      ? await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        )
      : 0;

    // Filter nodes if specific IDs provided
    let nodes: WorkflowVisualNode[] = workflow.nodes || [];
    if (nodeIds && nodeIds.length > 0) {
      nodes = nodes.filter((n) => nodeIds.includes(n.id));
    }

    // Convert to executable nodes format
    const executableNodes = nodes.map((n) => ({
      config: n.data?.config || {},
      id: n.id,
      inputs: [] as string[],
      label: n.data?.label || n.type,
      type: n.type,
    }));

    return calculateCreditEstimate(
      executableNodes,
      availableCredits,
      DEFAULT_CREDIT_COSTS,
    );
  }

  /**
   * Get execution logs for a specific run
   */
  @HandleErrors('get execution logs', 'workflows')
  async getExecutionLogs(
    workflowId: string,
    runId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const execution = await this.workflowExecutionsService?.findOne({
      _id: runId,
      isDeleted: false,
      organization: organizationId,
      workflow: workflowId,
    });

    if (!execution) {
      throw new NotFoundException('Execution run', runId);
    }

    return {
      completedAt: execution.completedAt,
      error: execution.error,
      nodeResults: execution.nodeResults || [],
      runId: execution._id.toString(),
      startedAt: execution.startedAt,
      status: execution.status,
      totalCreditsUsed: execution.creditsUsed,
      workflowId,
    };
  }

  private mapExecutionNodeStatus(status: string): WorkflowExecutionStatus {
    switch (status) {
      case 'pending':
        return WorkflowExecutionStatus.PENDING;
      case 'running':
        return WorkflowExecutionStatus.RUNNING;
      case 'completed':
      case 'skipped':
        return WorkflowExecutionStatus.COMPLETED;
      case 'failed':
        return WorkflowExecutionStatus.FAILED;
      default:
        return WorkflowExecutionStatus.PENDING;
    }
  }

  private findFirstFailedNodeId(
    result: ExecutionRunResult,
  ): string | undefined {
    for (const [nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status === 'failed') {
        return nodeId;
      }
    }

    return undefined;
  }

  private async emitWorkflowEvent(
    workflowId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.websocketService || !workflowId) {
      return;
    }

    await this.websocketService.emit(`workflow:${workflowId}:${event}`, {
      workflowId,
      ...data,
    });
  }
}
