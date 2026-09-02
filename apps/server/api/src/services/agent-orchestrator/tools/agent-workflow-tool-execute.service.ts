import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import type { WorkflowInputVariable } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { computeNextRunAtOrThrow } from '@api/collections/workflows/utils/cron-schedule.util';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  readOptionalNumber,
  readOptionalString,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { toAgentScopeMetadata } from '@genfeedai/interfaces';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

/**
 * List / inspect / duplicate / schedule / run / execute workflow tools.
 */
@Injectable()
export class AgentWorkflowToolExecuteService {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowSchedulerService: WorkflowSchedulerService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    @Inject(SYSTEM_WORKFLOW_RUNNER)
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {}

  async listWorkflows(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = (params.limit as number) || 10;
    const workflows = await this.workflowsService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
        orderBy: { updatedAt: -1 },
      },
      {},
    );
    const docs = (workflows.docs ?? []).slice(0, limit);

    return {
      creditsUsed: 0,
      data: {
        count: docs.length,
        workflows: docs.map((w) => {
          const workflow = w as unknown as Record<string, unknown>;
          return {
            description: workflow.description,
            id: String(workflow.id),
            name: workflow.name,
            status: workflow.status,
            updatedAt: workflow.updatedAt,
          };
        }),
      },
      success: true,
    };
  }

  async inspectWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    if (!workflowId) {
      return {
        creditsUsed: 0,
        error: 'workflowId is required',
        success: false,
      };
    }

    const workflow = await this.workflowsService.findOne({
      id: workflowId,
      organizationId: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        workflow: this.mapWorkflowForTool(
          workflow as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  async duplicateWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    if (!workflowId) {
      return {
        creditsUsed: 0,
        error: 'workflowId is required',
        success: false,
      };
    }

    const workflow = await this.workflowsService.cloneWorkflow(
      workflowId,
      ctx.userId,
      ctx.organizationId,
      ctx.brandId,
    );

    return {
      creditsUsed: 0,
      data: {
        workflow: this.mapWorkflowForTool(
          workflow as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  async setWorkflowSchedule(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    const enabled =
      typeof params.enabled === 'boolean' ? params.enabled : undefined;

    if (!workflowId || enabled === undefined) {
      return {
        creditsUsed: 0,
        error: 'workflowId and enabled are required',
        success: false,
      };
    }

    const schedule = readOptionalString(params.schedule);
    const requestedTimezone = readOptionalString(params.timezone);
    if (enabled === true && !schedule) {
      return {
        creditsUsed: 0,
        error: 'schedule is required when enabling a workflow schedule',
        success: false,
      };
    }

    const workflow = await this.workflowsService.findOne({
      id: workflowId,
      isDeleted: false,
      organizationId: ctx.organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow', workflowId);
    }

    // Partial-update semantics matching PATCH /workflows/:workflowId: an
    // omitted field keeps the stored value, so disabling without a new cron
    // pauses the schedule instead of wiping cron and timezone.
    const effectiveSchedule = schedule ?? workflow.schedule ?? null;
    const effectiveTimezone = requestedTimezone ?? workflow.timezone ?? 'UTC';

    if (schedule) {
      try {
        computeNextRunAtOrThrow(schedule, effectiveTimezone);
      } catch {
        throw new BadRequestException(
          `Invalid cron expression "${schedule}" for timezone "${effectiveTimezone}". Use a valid cron expression such as "0 9 * * 1-5".`,
        );
      }
    }

    const updatedWorkflow = await this.workflowSchedulerService.updateSchedule(
      workflowId,
      effectiveSchedule,
      effectiveTimezone,
      enabled,
    );

    if (!updatedWorkflow) {
      throw new NotFoundException('Workflow', workflowId);
    }

    return {
      creditsUsed: 0,
      data: {
        enabled: updatedWorkflow.isScheduleEnabled ?? false,
        schedule: updatedWorkflow.schedule ?? null,
        timezone: updatedWorkflow.timezone ?? effectiveTimezone,
        workflowId: String(updatedWorkflow.id),
      },
      success: true,
    };
  }

  async listWorkflowRuns(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = readOptionalString(params.workflowId);
    const status = readOptionalString(params.status);
    const trigger = readOptionalString(params.trigger);
    const limit = readOptionalNumber(params.limit) ?? 20;
    const offset = readOptionalNumber(params.offset) ?? 0;
    const page = offset > 0 ? Math.floor(offset / limit) + 1 : 1;

    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId: ctx.organizationId,
    };
    if (workflowId) where.workflowId = workflowId;
    if (status) where.status = status;
    if (trigger) where.trigger = trigger;

    const result = await this.workflowExecutionsService.findAll(
      { orderBy: { createdAt: -1 }, where },
      { limit, page },
    );

    return {
      creditsUsed: 0,
      data: {
        count: result.docs?.length ?? 0,
        runs: result.docs ?? [],
      },
      success: true,
    };
  }

  async getWorkflowRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const runId = readOptionalString(params.runId);
    if (!runId) {
      return {
        creditsUsed: 0,
        error: 'runId is required',
        success: false,
      };
    }

    const run = await this.workflowExecutionsService.findOne({
      id: runId,
      organizationId: ctx.organizationId,
    });

    if (!run) {
      return {
        creditsUsed: 0,
        error: `Workflow run ${runId} not found`,
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: { run },
      success: true,
    };
  }

  async executeWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = params.workflowId as string;
    const inputValues =
      (params.inputs as Record<string, unknown> | undefined) ??
      (params.inputValues as Record<string, unknown> | undefined) ??
      (params.variables as Record<string, unknown> | undefined) ??
      {};

    const systemWorkflow = this.systemWorkflowRunner.getWorkflow(workflowId);
    if (systemWorkflow) {
      const mergedInputValues = this.mergeSystemWorkflowInputs(
        systemWorkflow.definition.inputVariables ?? [],
        inputValues,
        ctx.brandId,
      );
      const missingKeys = this.missingRequiredInputKeys(
        systemWorkflow.definition.inputVariables ?? [],
        mergedInputValues,
      );
      if (missingKeys.length > 0) {
        return {
          creditsUsed: 0,
          error: `Missing required workflow inputs: ${missingKeys.join(', ')}. Use get_workflow_inputs to discover expected variables.`,
          success: false,
        };
      }

      const { provenance, result } =
        await this.systemWorkflowRunner.runWorkflow({
          actionType: workflowId,
          canonicalId: workflowId,
          inputValues: mergedInputValues,
          metadata: { origin: 'agent' },
          organizationId: ctx.organizationId,
          source: 'AgentWorkflowToolExecuteService.executeWorkflow',
          userId: ctx.userId,
        });

      return {
        creditsUsed: 0,
        data: {
          id: provenance.executionId,
          result,
          status: WorkflowExecutionStatus.COMPLETED,
        },
        success: true,
      };
    }

    const workflow = await this.workflowsService.findOne({
      id: workflowId,
      organizationId: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    const requiredVars = (workflow.inputVariables ?? []).filter(
      (v) => v.required,
    );
    const missingKeys = requiredVars
      .filter((v) => !(v.key in inputValues))
      .map((v) => v.key);

    if (missingKeys.length > 0) {
      return {
        creditsUsed: 0,
        error: `Missing required workflow inputs: ${missingKeys.join(', ')}. Use get_workflow_inputs to discover expected variables.`,
        success: false,
      };
    }

    const result = ctx.validatedScope
      ? await this.workflowExecutorService.executeManualWorkflow(
          workflowId,
          ctx.userId,
          ctx.organizationId,
          inputValues,
          { agentScope: toAgentScopeMetadata(ctx.validatedScope) },
          WorkflowExecutionTrigger.MANUAL,
          ctx.validatedScope,
        )
      : await this.workflowExecutorService.executeManualWorkflow(
          workflowId,
          ctx.userId,
          ctx.organizationId,
          inputValues,
        );

    return {
      creditsUsed: 0,
      data: {
        id: result.executionId,
        status: result.status,
      },
      success: true,
    };
  }

  async getWorkflowInputs(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const workflowId = params.workflowId as string;

    const systemWorkflow = this.systemWorkflowRunner.getWorkflow(workflowId);
    if (systemWorkflow) {
      return {
        creditsUsed: 0,
        data: {
          inputs: this.mapWorkflowInputVariables(
            systemWorkflow.definition.inputVariables ?? [],
          ),
          workflowId: systemWorkflow.canonicalId,
          workflowName: systemWorkflow.label,
        },
        success: true,
      };
    }

    const workflow = await this.workflowsService.findOne({
      id: workflowId,
      organizationId: ctx.organizationId,
    });

    if (!workflow) {
      return {
        creditsUsed: 0,
        error: `Workflow ${workflowId} not found`,
        success: false,
      };
    }

    const inputs = this.mapWorkflowInputVariables(
      workflow.inputVariables ?? [],
    );

    return {
      creditsUsed: 0,
      data: {
        inputs,
        workflowId: String(workflow.id),
        workflowName:
          (workflow as unknown as Record<string, unknown>).name ??
          (workflow as unknown as Record<string, unknown>).label ??
          null,
      },
      success: true,
    };
  }

  private mergeSystemWorkflowInputs(
    inputVariables: WorkflowInputVariable[],
    inputValues: Record<string, unknown>,
    brandId: string | undefined,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...inputValues };
    for (const variable of inputVariables) {
      if (
        merged[variable.key] === undefined &&
        variable.defaultValue !== undefined
      ) {
        merged[variable.key] = variable.defaultValue;
      }
    }
    if (brandId && merged.brandId === undefined) {
      merged.brandId = brandId;
    }
    return merged;
  }

  private missingRequiredInputKeys(
    inputVariables: WorkflowInputVariable[],
    inputValues: Record<string, unknown>,
  ): string[] {
    return inputVariables
      .filter((variable) => variable.required && !(variable.key in inputValues))
      .map((variable) => variable.key);
  }

  private mapWorkflowInputVariables(inputVariables: WorkflowInputVariable[]) {
    return inputVariables.map((variable) => ({
      defaultValue: variable.defaultValue ?? null,
      description: variable.description ?? null,
      key: variable.key,
      label: variable.label,
      required: variable.required ?? false,
      type: variable.type,
      ...(variable.validation ? { validation: variable.validation } : {}),
    }));
  }

  private mapWorkflowForTool(
    workflow: Record<string, unknown>,
  ): Record<string, unknown> {
    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    const edges = Array.isArray(workflow.edges) ? workflow.edges : [];

    return {
      description: workflow.description,
      edgeCount: edges.length,
      id: String(workflow.id ?? ''),
      inputVariables: Array.isArray(workflow.inputVariables)
        ? workflow.inputVariables
        : [],
      isScheduleEnabled: workflow.isScheduleEnabled,
      label: workflow.label ?? workflow.name,
      lifecycle: workflow.lifecycle,
      metadata: workflow.metadata,
      nodeCount: nodes.length,
      schedule: workflow.schedule,
      status: workflow.status,
      timezone: workflow.timezone,
      updatedAt: workflow.updatedAt,
    };
  }
}
