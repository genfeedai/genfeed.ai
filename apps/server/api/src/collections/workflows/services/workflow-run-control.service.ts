import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { type WorkflowExecutionDocument } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { type WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { CreditEstimate } from '@genfeedai/workflows/engine';
import {
  calculateCreditEstimate,
  DEFAULT_CREDIT_COSTS,
} from '@genfeedai/workflows/engine';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

/**
 * Run-control surface for node-based workflow executions: partial (subset of
 * nodes) runs, resume-from-failed, credit validation, and execution log
 * retrieval. Split out of `WorkflowsService` (#754).
 */
@Injectable()
export class WorkflowRunControlService {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
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
      id: workflowId,
      organizationId: organizationId,
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

    const result =
      await this.workflowExecutorService.executePartialWorkflowDocument(
        workflow,
        userId,
        organizationId,
        nodeIds,
        options.respectLocks,
      );
    const execution = await this.workflowExecutionsService.findOne({
      id: result.executionId,
      organizationId,
      workflowId,
    });
    if (!execution) {
      throw new NotFoundException('Execution run', result.executionId);
    }

    return execution;
  }

  /**
   * Resume the same immutable workflow execution from durable node results.
   */
  @HandleErrors('resume workflow execution', 'workflows')
  async resumeFromFailed(
    workflowId: string,
    runId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ runId: string; status: string; message: string }> {
    const workflow = await this.workflowsService.findOne({
      id: workflowId,
      organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    const failedRun = await this.workflowExecutionsService.findOne({
      id: runId,
      organizationId,
      workflowId,
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

    const result = await this.workflowExecutorService.continueExistingExecution(
      runId,
      {
        data: failedRun.inputValues ?? {},
        organizationId,
        platform: 'manual',
        type: 'resume',
        userId,
      },
    );

    return {
      message: 'Workflow execution resumed',
      runId,
      status: result.status,
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
      id: workflowId,
      organizationId: organizationId,
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
    const execution = await this.workflowExecutionsService.findOne({
      id: runId,
      organizationId: organizationId,
      workflowId: workflowId,
    });

    if (!execution) {
      throw new NotFoundException('Execution run', runId);
    }

    return {
      completedAt: execution.completedAt,
      error: execution.error,
      nodeResults: execution.nodeResults || [],
      runId: execution.id,
      startedAt: execution.startedAt,
      status: execution.status,
      totalCreditsUsed: execution.creditsUsed,
      workflowId,
    };
  }
}
