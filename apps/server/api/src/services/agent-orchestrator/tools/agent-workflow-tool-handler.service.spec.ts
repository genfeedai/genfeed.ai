import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentWorkflowToolHandler routing', () => {
  const installService = {
    installOfficialWorkflow: vi.fn(),
    installSystemWorkflow: vi.fn(),
    listSystemWorkflowCatalog: vi.fn(),
  };
  const createService = {
    createWorkflow: vi.fn(),
  };
  const executeService = {
    duplicateWorkflow: vi.fn(),
    executeWorkflow: vi.fn(),
    getWorkflowInputs: vi.fn(),
    getWorkflowRun: vi.fn(),
    inspectWorkflow: vi.fn(),
    listWorkflowRuns: vi.fn(),
    listWorkflows: vi.fn(),
    setWorkflowSchedule: vi.fn(),
  };
  const ctx = {
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;
  const params = { workflowId: 'wf-1' };

  let handler: AgentWorkflowToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AgentWorkflowToolHandler(
      installService as never,
      createService as never,
      executeService as never,
    );
  });

  it('routes install, create, and execute clusters without changing params', async () => {
    const ok = { creditsUsed: 0, success: true };
    installService.listSystemWorkflowCatalog.mockResolvedValue(ok);
    installService.installSystemWorkflow.mockResolvedValue(ok);
    installService.installOfficialWorkflow.mockResolvedValue(ok);
    createService.createWorkflow.mockResolvedValue(ok);
    executeService.listWorkflows.mockResolvedValue(ok);
    executeService.inspectWorkflow.mockResolvedValue(ok);
    executeService.duplicateWorkflow.mockResolvedValue(ok);
    executeService.setWorkflowSchedule.mockResolvedValue(ok);
    executeService.listWorkflowRuns.mockResolvedValue(ok);
    executeService.getWorkflowRun.mockResolvedValue(ok);
    executeService.executeWorkflow.mockResolvedValue(ok);
    executeService.getWorkflowInputs.mockResolvedValue(ok);

    await expect(
      handler.listSystemWorkflowCatalog(params, ctx),
    ).resolves.toEqual(ok);
    await expect(handler.installSystemWorkflow(params, ctx)).resolves.toEqual(
      ok,
    );
    await expect(handler.installOfficialWorkflow(params, ctx)).resolves.toEqual(
      ok,
    );
    await expect(handler.createWorkflow(params, ctx)).resolves.toEqual(ok);
    await expect(handler.listWorkflows(params, ctx)).resolves.toEqual(ok);
    await expect(handler.inspectWorkflow(params, ctx)).resolves.toEqual(ok);
    await expect(handler.duplicateWorkflow(params, ctx)).resolves.toEqual(ok);
    await expect(handler.setWorkflowSchedule(params, ctx)).resolves.toEqual(ok);
    await expect(handler.listWorkflowRuns(params, ctx)).resolves.toEqual(ok);
    await expect(handler.getWorkflowRun(params, ctx)).resolves.toEqual(ok);
    await expect(handler.executeWorkflow(params, ctx)).resolves.toEqual(ok);
    await expect(handler.getWorkflowInputs(params, ctx)).resolves.toEqual(ok);

    expect(installService.listSystemWorkflowCatalog).toHaveBeenCalledWith(
      params,
      ctx,
    );
    expect(installService.installSystemWorkflow).toHaveBeenCalledWith(
      params,
      ctx,
    );
    expect(installService.installOfficialWorkflow).toHaveBeenCalledWith(
      params,
      ctx,
    );
    expect(createService.createWorkflow).toHaveBeenCalledWith(params, ctx);
    expect(executeService.listWorkflows).toHaveBeenCalledWith(params, ctx);
    expect(executeService.inspectWorkflow).toHaveBeenCalledWith(params, ctx);
    expect(executeService.duplicateWorkflow).toHaveBeenCalledWith(params, ctx);
    expect(executeService.setWorkflowSchedule).toHaveBeenCalledWith(
      params,
      ctx,
    );
    expect(executeService.listWorkflowRuns).toHaveBeenCalledWith(params, ctx);
    expect(executeService.getWorkflowRun).toHaveBeenCalledWith(params, ctx);
    expect(executeService.executeWorkflow).toHaveBeenCalledWith(params, ctx);
    expect(executeService.getWorkflowInputs).toHaveBeenCalledWith(params, ctx);
  });
});
