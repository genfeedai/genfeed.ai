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
  const scheduleAuthority = {
    withScheduleAuthority: vi.fn(
      async (context: ToolExecutionContext) => context,
    ),
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
      scheduleAuthority as never,
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

describe('AgentWorkflowToolHandler schedule authority (#6689)', () => {
  const ok = { creditsUsed: 0, success: true };
  const params = { workflowId: 'wf-1' };
  const ctx = {
    organizationId: 'org-1',
    strategyId: 'strategy-1',
    userId: 'owner-1',
  } as ToolExecutionContext;
  const bound = {
    ...ctx,
    scheduleAuthorityPrincipal: {
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'admin-1',
    },
  } as ToolExecutionContext;

  const installService = {
    installOfficialWorkflow: vi.fn().mockResolvedValue(ok),
    installSystemWorkflow: vi.fn().mockResolvedValue(ok),
  };
  const createService = { createWorkflow: vi.fn().mockResolvedValue(ok) };
  const executeService = {
    duplicateWorkflow: vi.fn().mockResolvedValue(ok),
    inspectWorkflow: vi.fn().mockResolvedValue(ok),
    listWorkflows: vi.fn().mockResolvedValue(ok),
    setWorkflowSchedule: vi.fn().mockResolvedValue(ok),
  };
  const scheduleAuthority = {
    withScheduleAuthority: vi.fn().mockResolvedValue(bound),
  };
  let handler: AgentWorkflowToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AgentWorkflowToolHandler(
      installService as never,
      createService as never,
      executeService as never,
      scheduleAuthority as never,
    );
  });

  it.each([
    ['createWorkflow', createService.createWorkflow],
    ['duplicateWorkflow', executeService.duplicateWorkflow],
    ['installOfficialWorkflow', installService.installOfficialWorkflow],
    ['installSystemWorkflow', installService.installSystemWorkflow],
    ['setWorkflowSchedule', executeService.setWorkflowSchedule],
  ] as const)(
    'runs %s with the strategy actor read live for this call',
    async (method, target) => {
      await handler[method](params, ctx);

      expect(scheduleAuthority.withScheduleAuthority).toHaveBeenCalledWith(ctx);
      expect(target).toHaveBeenCalledWith(params, bound);
    },
  );

  it.each([
    ['listWorkflows', executeService.listWorkflows],
    ['inspectWorkflow', executeService.inspectWorkflow],
  ] as const)(
    'does not resolve a schedule authority for %s',
    async (method, target) => {
      await handler[method](params, ctx);

      expect(scheduleAuthority.withScheduleAuthority).not.toHaveBeenCalled();
      expect(target).toHaveBeenCalledWith(params, ctx);
    },
  );
});
