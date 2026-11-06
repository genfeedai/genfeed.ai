import type { AgentStrategyScheduleAuthorityService } from '@api/services/agent-orchestrator/tools/agent-strategy-schedule-authority.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import type { AgentWorkflowToolExecuteService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-execute.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import type { AgentWorkflowToolInstallService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import { beforeEach, describe, expect, it } from 'vitest';

type HandlerMethod =
  | 'createWorkflow'
  | 'duplicateWorkflow'
  | 'executeWorkflow'
  | 'getWorkflowInputs'
  | 'getWorkflowRun'
  | 'inspectWorkflow'
  | 'installOfficialWorkflow'
  | 'installSystemWorkflow'
  | 'listSystemWorkflowCatalog'
  | 'listWorkflowRuns'
  | 'listWorkflows'
  | 'setWorkflowSchedule';

// Each fake tool answers with where it ran and the context it ran under.
const route =
  (target: string) =>
  async (params: Record<string, unknown>, ctx: ToolExecutionContext) => ({
    creditsUsed: 0,
    data: { ctx, params, target },
    success: true,
  });

describe('AgentWorkflowToolHandler', () => {
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

  let authorityRequests: ToolExecutionContext[];
  let handler: AgentWorkflowToolHandler;

  beforeEach(() => {
    authorityRequests = [];
    handler = new AgentWorkflowToolHandler(
      {
        installOfficialWorkflow: route('install.installOfficialWorkflow'),
        installSystemWorkflow: route('install.installSystemWorkflow'),
        listSystemWorkflowCatalog: route('install.listSystemWorkflowCatalog'),
      } as unknown as AgentWorkflowToolInstallService,
      {
        createWorkflow: route('create.createWorkflow'),
      } as unknown as AgentWorkflowToolCreateService,
      {
        duplicateWorkflow: route('execute.duplicateWorkflow'),
        executeWorkflow: route('execute.executeWorkflow'),
        getWorkflowInputs: route('execute.getWorkflowInputs'),
        getWorkflowRun: route('execute.getWorkflowRun'),
        inspectWorkflow: route('execute.inspectWorkflow'),
        listWorkflowRuns: route('execute.listWorkflowRuns'),
        listWorkflows: route('execute.listWorkflows'),
        setWorkflowSchedule: route('execute.setWorkflowSchedule'),
      } as unknown as AgentWorkflowToolExecuteService,
      {
        withScheduleAuthority: async (context: ToolExecutionContext) => {
          authorityRequests.push(context);
          return bound;
        },
      } as unknown as AgentStrategyScheduleAuthorityService,
    );
  });

  it.each<[HandlerMethod, string]>([
    ['executeWorkflow', 'execute.executeWorkflow'],
    ['getWorkflowInputs', 'execute.getWorkflowInputs'],
    ['getWorkflowRun', 'execute.getWorkflowRun'],
    ['inspectWorkflow', 'execute.inspectWorkflow'],
    ['listSystemWorkflowCatalog', 'install.listSystemWorkflowCatalog'],
    ['listWorkflowRuns', 'execute.listWorkflowRuns'],
    ['listWorkflows', 'execute.listWorkflows'],
  ])(
    'routes %s to %s with the caller context and no schedule authority',
    async (method, target) => {
      await expect(handler[method](params, ctx)).resolves.toEqual({
        creditsUsed: 0,
        data: { ctx, params, target },
        success: true,
      });
      expect(authorityRequests).toEqual([]);
    },
  );

  it.each<[HandlerMethod, string]>([
    ['createWorkflow', 'create.createWorkflow'],
    ['duplicateWorkflow', 'execute.duplicateWorkflow'],
    ['installOfficialWorkflow', 'install.installOfficialWorkflow'],
    ['installSystemWorkflow', 'install.installSystemWorkflow'],
    ['setWorkflowSchedule', 'execute.setWorkflowSchedule'],
  ])(
    'runs %s on %s with the strategy actor read live for this call (#6689)',
    async (method, target) => {
      await expect(handler[method](params, ctx)).resolves.toEqual({
        creditsUsed: 0,
        data: { ctx: bound, params, target },
        success: true,
      });
      expect(authorityRequests).toEqual([ctx]);
    },
  );
});
