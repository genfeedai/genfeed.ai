import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolInstallService } from '@server/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `install_official_workflow` resolves against the system workflow catalog
 * (#2250).
 *
 * The resolver used to score only `WORKFLOW_TEMPLATES` and the marketplace, so
 * 8 of the 9 code-owned catalog families were unreachable from the
 * conversational path even after #2249 added the explicit catalog tools.
 */
describe('AgentWorkflowToolInstallService official workflow resolution', () => {
  const workflowsService = {
    createWorkflow: vi.fn(),
    findOne: vi.fn().mockResolvedValue(null),
    getWorkflowTemplates: vi.fn(),
    patch: vi.fn(),
  };
  const systemWorkflowCatalogService = {
    install: vi.fn(),
    listCatalogForOrganization: vi.fn(),
  };
  const brandsService = { findOne: vi.fn().mockResolvedValue(null) };
  const createService = {
    createWorkflowFromRecurringScaffold: vi.fn(),
  };

  // Server-owned confirmation cache: a card build persists the pending
  // install and the confirmed resume must present its sourceActionId.
  const cacheService = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(true),
  };

  const ctx: ToolExecutionContext = {
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;
  const confirmedCtx: ToolExecutionContext = {
    ...ctx,
    confirmationOrigin: 'thread-ui-action',
    threadId: 'thread-1',
  } as ToolExecutionContext;
  const persistedInstall = {
    organizationId: 'org-1',
    sourceActionId: 'workflow-bootstrap-preview-1',
    threadId: 'thread-1',
    toolName: 'install_official_workflow',
  };

  let handler: AgentWorkflowToolInstallService;

  function buildCatalog() {
    return [
      {
        canonicalId: 'reply-polling-x',
        description: 'Poll replies on connected accounts and draft responses.',
        family: 'reply-polling',
        installable: true,
        installed: false,
        installedWorkflowId: null,
        isScheduleEnabled: true,
        label: 'Reply Polling',
        schedule: '*/15 * * * *',
        timezone: 'UTC',
        version: 3,
      },
      {
        canonicalId: 'system-action-publish',
        // Deliberately worded to win on tokens if it were ever a candidate.
        description: 'Poll replies on connected accounts and draft responses.',
        family: 'system-action',
        installable: false,
        installed: false,
        installedWorkflowId: null,
        isScheduleEnabled: false,
        label: 'Reply Polling',
        timezone: 'UTC',
        version: 3,
      },
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    workflowsService.findOne.mockResolvedValue(null);
    brandsService.findOne.mockResolvedValue(null);
    workflowsService.getWorkflowTemplates.mockResolvedValue([]);
    systemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
      buildCatalog(),
    );
    cacheService.get.mockResolvedValue(persistedInstall);
    cacheService.set.mockResolvedValue(true);
    handler = new AgentWorkflowToolInstallService(
      {} as never,
      workflowsService as never,
      brandsService as never,
      systemWorkflowCatalogService as never,
      createService as never,
      undefined,
      undefined,
      cacheService as never,
    );
  });

  it('resolves a catalog entry as the install source', async () => {
    const result = await handler.installOfficialWorkflow(
      { prompt: 'poll replies and draft responses every 15 minutes' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      confirmationRequired: true,
      resolution: 'system-catalog',
      sourceId: 'reply-polling-x',
      sourceType: 'system-catalog',
    });
  });

  it('prefers a catalog entry over a seeded template on equal confidence', async () => {
    workflowsService.getWorkflowTemplates.mockResolvedValue([
      {
        description: 'Poll replies on connected accounts and draft responses.',
        id: 'legacy-reply-poller',
        name: 'Reply Polling',
      },
    ]);

    const result = await handler.installOfficialWorkflow(
      { prompt: 'poll replies and draft responses every 15 minutes' },
      ctx,
    );

    expect(result.data).toMatchObject({
      sourceId: 'reply-polling-x',
      sourceType: 'system-catalog',
    });
  });

  it('never offers a non-installable catalog entry', async () => {
    systemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
      buildCatalog().filter((entry) => !entry.installable),
    );

    const result = await handler.installOfficialWorkflow(
      { prompt: 'poll replies and draft responses every 15 minutes' },
      ctx,
    );

    expect(result.data).toMatchObject({ resolution: 'generated' });
  });

  it('points at the existing workflow when the entry is already installed', async () => {
    systemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
      buildCatalog().map((entry) =>
        entry.canonicalId === 'reply-polling-x'
          ? { ...entry, installed: true, installedWorkflowId: 'wf-existing' }
          : entry,
      ),
    );

    const result = await handler.installOfficialWorkflow(
      { prompt: 'poll replies and draft responses every 15 minutes' },
      ctx,
    );

    expect(result.data).toMatchObject({
      alreadyInstalled: true,
      editorUrl: '/automation/workflows/wf-existing',
      id: 'wf-existing',
    });
    expect(result.data?.confirmationRequired).toBeUndefined();
    expect(result.requiresConfirmation).toBeUndefined();
    expect(systemWorkflowCatalogService.install).not.toHaveBeenCalled();
  });

  it('installs a confirmed catalog entry through the catalog service', async () => {
    systemWorkflowCatalogService.install.mockResolvedValue({ id: 'wf-new' });

    const result = await handler.installOfficialWorkflow(
      {
        sourceActionId: 'workflow-bootstrap-preview-1',
        prompt: 'poll replies and draft responses every 15 minutes',
        sourceId: 'reply-polling-x',
        sourceName: 'Reply Polling',
        sourceType: 'system-catalog',
      },
      confirmedCtx,
    );

    expect(systemWorkflowCatalogService.install).toHaveBeenCalledWith({
      brandId: undefined,
      canonicalId: 'reply-polling-x',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    // The catalog canonicalId is not a WORKFLOW_TEMPLATES key, so it must never
    // reach the seeded-template create branch.
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      editorUrl: '/automation/workflows/wf-new',
      id: 'wf-new',
      installedFrom: 'system-catalog',
    });
  });

  it('surfaces a catalog install failure as a tool error', async () => {
    systemWorkflowCatalogService.install.mockRejectedValue(
      new Error('catalog unavailable'),
    );

    const result = await handler.installOfficialWorkflow(
      {
        sourceActionId: 'workflow-bootstrap-preview-1',
        sourceId: 'reply-polling-x',
        sourceName: 'Reply Polling',
        sourceType: 'system-catalog',
      },
      confirmedCtx,
    );

    expect(result).toMatchObject({
      error: 'catalog unavailable',
      success: false,
    });
  });

  it('falls back to the create scaffold when a confirmed install has no official source', async () => {
    systemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
      [],
    );
    createService.createWorkflowFromRecurringScaffold.mockResolvedValue({
      creditsUsed: 1,
      success: true,
    });

    const result = await handler.installOfficialWorkflow(
      {
        sourceActionId: 'workflow-bootstrap-preview-1',
        prompt: 'invent a unique sunrise mural nobody has catalogued',
        schedule: '0 9 * * 1-5',
      },
      confirmedCtx,
    );

    expect(
      createService.createWorkflowFromRecurringScaffold,
    ).toHaveBeenCalled();
    expect(result).toEqual({
      creditsUsed: 1,
      success: true,
    });
  });
  it('rejects a confirmed install whose sourceActionId was never persisted', async () => {
    cacheService.get.mockResolvedValue(null);

    const result = await handler.installOfficialWorkflow(
      {
        sourceActionId: 'forged-id',
        sourceId: 'reply-polling-x',
        sourceName: 'Reply Polling',
        sourceType: 'system-catalog',
      },
      confirmedCtx,
    );

    expect(result).toMatchObject({
      error:
        'sourceActionId does not match a persisted workflow install confirmation.',
      success: false,
    });
    expect(systemWorkflowCatalogService.install).not.toHaveBeenCalled();
  });
});
