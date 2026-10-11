import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import { AgentWorkflowToolExecuteService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-execute.service';
import { AgentWorkflowToolInstallService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import { AgentWorkflowToolOfficialResolverService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-official-resolver.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Schedules saved by agent workflow tools bind to the authenticated principal
 * the turn acts for (#6689). A system turn carries none and saves unbound; the
 * principal is never rebuilt from the workflow, brand or strategy owner.
 */
const userPrincipal = {
  isApiKey: false,
  organizationId: 'org-1',
  scopes: [],
  userId: 'user-1',
};
const apiKeyPrincipal = {
  apiKeyId: 'key-1',
  isApiKey: true,
  organizationId: 'org-1',
  scopes: ['posts:schedule'],
  userId: 'user-1',
};

function contextFor(
  overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
  return {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  } as ToolExecutionContext;
}

const principalCases = [
  [
    'a session user',
    contextFor({ initiatingPrincipal: userPrincipal }),
    userPrincipal,
  ],
  [
    'an API key',
    contextFor({ initiatingPrincipal: apiKeyPrincipal }),
    apiKeyPrincipal,
  ],
  ['a system turn', contextFor(), undefined],
  [
    'a proactive turn that carries a principal',
    contextFor({ initiatingPrincipal: userPrincipal, isProactive: true }),
    undefined,
  ],
  [
    'a principal for a different executing user',
    contextFor({ initiatingPrincipal: userPrincipal, userId: 'user-2' }),
    undefined,
  ],
] as const;

describe('AgentWorkflowToolCreateService schedule binding', () => {
  const workflowsService = { createWorkflow: vi.fn() };
  const brandsService = { findOne: vi.fn() };
  let service: AgentWorkflowToolCreateService;

  beforeEach(() => {
    vi.clearAllMocks();
    brandsService.findOne.mockResolvedValue({ id: 'brand-1', label: 'Acme' });
    workflowsService.createWorkflow.mockResolvedValue({ id: 'wf-1' });
    service = new AgentWorkflowToolCreateService(
      workflowsService as never,
      brandsService as never,
      { findOne: vi.fn() } as never,
      {} as never,
    );
  });

  it.each(principalCases)(
    'binds an explicit schedule for %s',
    async (_label, ctx, expected) => {
      await service.createWorkflow(
        { isScheduleEnabled: true, label: 'Daily', schedule: '0 9 * * *' },
        ctx,
      );

      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        ctx.userId,
        'org-1',
        expect.objectContaining({ schedule: '0 9 * * *' }),
        undefined,
        expected,
      );
    },
  );

  it.each(principalCases)(
    'binds a recurring scaffold schedule for %s',
    async (_label, ctx, expected) => {
      await service.createWorkflow(
        {
          contentType: 'image',
          prompt: 'sunrise city skyline',
          schedule: '0 9 * * 1-5',
        },
        ctx,
      );

      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        ctx.userId,
        'org-1',
        expect.objectContaining({ isScheduleEnabled: true }),
        undefined,
        expected,
      );
    },
  );
});

describe('AgentWorkflowToolExecuteService schedule binding', () => {
  const workflowsService = { cloneWorkflow: vi.fn(), findOne: vi.fn() };
  const workflowSchedulerService = { updateSchedule: vi.fn() };
  let service: AgentWorkflowToolExecuteService;

  beforeEach(() => {
    vi.clearAllMocks();
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-1',
      schedule: null,
      timezone: 'UTC',
    });
    workflowsService.cloneWorkflow.mockResolvedValue({ id: 'wf-copy' });
    workflowSchedulerService.updateSchedule.mockResolvedValue({
      id: 'wf-1',
      isScheduleEnabled: true,
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });
    service = new AgentWorkflowToolExecuteService(
      workflowsService as never,
      {} as never,
      workflowSchedulerService as never,
      {} as never,
      {} as never,
    );
  });

  it.each(principalCases)(
    'binds set_workflow_schedule for %s',
    async (_label, ctx, expected) => {
      await service.setWorkflowSchedule(
        { enabled: true, schedule: '0 9 * * *', workflowId: 'wf-1' },
        ctx,
      );

      expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
        'wf-1',
        'org-1',
        '0 9 * * *',
        'UTC',
        true,
        expected,
      );
    },
  );

  it.each(principalCases)(
    'binds a duplicated schedule to the caller, not the source owner, for %s',
    async (_label, ctx, expected) => {
      await service.duplicateWorkflow({ workflowId: 'wf-1' }, ctx);

      expect(workflowsService.cloneWorkflow).toHaveBeenCalledWith(
        'wf-1',
        ctx.userId,
        'org-1',
        'brand-1',
        undefined,
        expected,
      );
    },
  );
});

describe('AgentWorkflowToolInstallService schedule binding', () => {
  const workflowsService = {
    createWorkflow: vi.fn(),
    findOne: vi.fn(),
    getWorkflowTemplates: vi.fn(),
    patch: vi.fn(),
  };
  const systemWorkflowCatalogService = {
    install: vi.fn(),
    listCatalogForOrganization: vi.fn(),
  };
  const workflowSchedulerService = { updateSchedule: vi.fn() };
  const cacheService = { get: vi.fn(), set: vi.fn() };
  let service: AgentWorkflowToolInstallService;

  beforeEach(() => {
    vi.clearAllMocks();
    workflowsService.createWorkflow.mockResolvedValue({ id: 'wf-new' });
    workflowsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      id: 'wf-new',
      label: 'Installed',
      metadata: {},
    });
    workflowsService.getWorkflowTemplates.mockResolvedValue([]);
    systemWorkflowCatalogService.install.mockResolvedValue({ id: 'wf-new' });
    systemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
      [],
    );
    cacheService.get.mockResolvedValue({
      organizationId: 'org-1',
      sourceActionId: 'preview-1',
      threadId: 'thread-1',
      toolName: 'install_official_workflow',
    });
    service = new AgentWorkflowToolInstallService(
      {} as never,
      workflowsService as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      systemWorkflowCatalogService as never,
      {} as never,
      new AgentWorkflowToolOfficialResolverService(
        systemWorkflowCatalogService as never,
        workflowsService as never,
      ),
      workflowSchedulerService as never,
      undefined,
      undefined,
      cacheService as never,
    );
  });

  it.each(principalCases)(
    'binds a catalog install for %s',
    async (_label, ctx, expected) => {
      await service.installSystemWorkflow({ canonicalId: 'daily-digest' }, ctx);

      expect(systemWorkflowCatalogService.install).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'daily-digest',
          organizationId: 'org-1',
          schedulePrincipal: expected,
          userId: ctx.userId,
        }),
      );
    },
  );

  describe('confirmed seeded-template install', () => {
    const params = {
      schedule: '0 9 * * 1',
      sourceActionId: 'preview-1',
      sourceId: 'social-media-video-series',
      sourceName: 'Social Media Video Series',
      sourceType: 'seeded-template',
      timezone: 'Europe/Malta',
    };

    beforeEach(() => {
      workflowsService.getWorkflowTemplates.mockResolvedValue([
        {
          id: 'social-media-video-series',
          name: 'Social Media Video Series',
        },
      ]);
    });

    it.each(principalCases)(
      'binds the created and re-applied schedule for %s',
      async (_label, ctx, expected) => {
        const confirmed = {
          ...ctx,
          confirmationOrigin: 'thread-ui-action',
          threadId: 'thread-1',
        } as ToolExecutionContext;

        const result = await service.installOfficialWorkflow(params, confirmed);

        expect(result.success).toBe(true);
        expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
          ctx.userId,
          'org-1',
          expect.objectContaining({ isScheduleEnabled: true }),
          undefined,
          expected,
        );
        // The schedule is written through the shared contract, never by patching
        // the schedule columns directly (which would enable it with no actor).
        expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
          'wf-new',
          'org-1',
          '0 9 * * 1',
          'Europe/Malta',
          true,
          expected,
        );
        expect(workflowsService.patch).toHaveBeenCalledWith(
          'wf-new',
          expect.not.objectContaining({ isScheduleEnabled: true }),
        );
      },
    );
  });
});
