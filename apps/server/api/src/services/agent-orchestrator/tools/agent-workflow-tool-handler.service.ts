import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import { AgentWorkflowToolExecuteService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-execute.service';
import { AgentWorkflowToolInstallService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Workflow tools extracted from AgentToolExecutorService per #519.
 *
 * #2856 split the leftover god object:
 * - AgentWorkflowToolInstallService — catalog + official install
 * - AgentWorkflowToolCreateService — create + recurring scaffold
 * - AgentWorkflowToolExecuteService — list/inspect/duplicate/schedule/run/execute
 *
 * This class stays a router so AgentToolExecutorService keeps the same surface.
 */
@Injectable()
export class AgentWorkflowToolHandler {
  constructor(
    private readonly installService: AgentWorkflowToolInstallService,
    private readonly createService: AgentWorkflowToolCreateService,
    private readonly executeService: AgentWorkflowToolExecuteService,
  ) {}

  async listSystemWorkflowCatalog(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.installService.listSystemWorkflowCatalog(params, ctx);
  }

  async installSystemWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.installService.installSystemWorkflow(params, ctx);
  }

  async installOfficialWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.installService.installOfficialWorkflow(params, ctx);
  }

  async createWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.createService.createWorkflow(params, ctx);
  }

  async listWorkflows(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.listWorkflows(params, ctx);
  }

  async inspectWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.inspectWorkflow(params, ctx);
  }

  async duplicateWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.duplicateWorkflow(params, ctx);
  }

  async setWorkflowSchedule(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.setWorkflowSchedule(params, ctx);
  }

  async listWorkflowRuns(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.listWorkflowRuns(params, ctx);
  }

  async getWorkflowRun(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.getWorkflowRun(params, ctx);
  }

  async executeWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.executeWorkflow(params, ctx);
  }

  async getWorkflowInputs(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.executeService.getWorkflowInputs(params, ctx);
  }
}
