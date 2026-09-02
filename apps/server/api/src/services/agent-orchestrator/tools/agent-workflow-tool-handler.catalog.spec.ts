import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolInstallService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * System workflow catalog reaches the agent surface (#2246).
 *
 * The catalog shipped in #2223 with only a REST + app-UI surface; these cover
 * the agent half of `system_workflows_content_os`.
 */
describe('AgentWorkflowToolInstallService system workflow catalog', () => {
  const systemWorkflowCatalogService = {
    install: vi.fn(),
    listCatalogForOrganization: vi.fn(),
  };

  const brandsService = {
    findOne: vi.fn(),
  };

  const ctx: ToolExecutionContext = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;

  let handler: AgentWorkflowToolInstallService;

  function canonicalIds(data: Record<string, unknown> | undefined): string[] {
    const entries = (data?.entries ?? []) as Array<{ canonicalId: string }>;
    return entries.map((entry) => entry.canonicalId);
  }

  function buildCatalog() {
    return [
      {
        canonicalId: 'daily-trends-digest',
        description: 'Daily trends digest',
        family: 'product',
        installable: true,
        installed: false,
        installedWorkflowId: null,
        isScheduleEnabled: true,
        label: 'Daily Trends Digest',
        schedule: '0 8 * * *',
        sourceIssue: 1011,
        timezone: 'UTC',
        version: 3,
      },
      {
        canonicalId: 'reply-polling-x',
        description: 'Poll X replies',
        family: 'reply-polling',
        installable: true,
        installed: true,
        installedWorkflowId: 'wf-existing',
        isScheduleEnabled: true,
        label: 'Reply Polling',
        schedule: '*/15 * * * *',
        sourceIssue: 787,
        timezone: 'UTC',
        version: 3,
      },
      {
        canonicalId: 'system-action-publish',
        description: 'Publish action wrapper',
        family: 'system-action',
        installable: false,
        installed: false,
        installedWorkflowId: null,
        isScheduleEnabled: false,
        label: 'Publish Action',
        sourceIssue: 1011,
        timezone: 'UTC',
        version: 3,
      },
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    systemWorkflowCatalogService.listCatalogForOrganization.mockResolvedValue(
      buildCatalog(),
    );

    handler = new AgentWorkflowToolInstallService(
      {} as never,
      {} as never,
      brandsService as never,
      systemWorkflowCatalogService as never,
      {} as never,
    );
  });

  describe('listSystemWorkflowCatalog', () => {
    it('returns installable entries with organization install state by default', async () => {
      const result = await handler.listSystemWorkflowCatalog({}, ctx);

      expect(
        systemWorkflowCatalogService.listCatalogForOrganization,
      ).toHaveBeenCalledWith('org-1');
      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(2);
      expect(result.data?.entries).toEqual([
        {
          canonicalId: 'daily-trends-digest',
          description: 'Daily trends digest',
          family: 'product',
          installable: true,
          installed: false,
          installedWorkflowId: null,
          isScheduleEnabled: true,
          label: 'Daily Trends Digest',
          schedule: '0 8 * * *',
          timezone: 'UTC',
          version: 3,
        },
        {
          canonicalId: 'reply-polling-x',
          description: 'Poll X replies',
          family: 'reply-polling',
          installable: true,
          installed: true,
          installedWorkflowId: 'wf-existing',
          isScheduleEnabled: true,
          label: 'Reply Polling',
          schedule: '*/15 * * * *',
          timezone: 'UTC',
          version: 3,
        },
      ]);
    });

    it('includes non-installable system actions only when asked', async () => {
      const result = await handler.listSystemWorkflowCatalog(
        { includeNonInstallable: true },
        ctx,
      );

      expect(result.data?.count).toBe(3);
    });

    it('filters by family', async () => {
      const result = await handler.listSystemWorkflowCatalog(
        { family: 'reply-polling' },
        ctx,
      );

      expect(result.data?.count).toBe(1);
      expect(canonicalIds(result.data)).toEqual(['reply-polling-x']);
    });

    it('filters to installed entries when installedOnly is set', async () => {
      const result = await handler.listSystemWorkflowCatalog(
        { installedOnly: true },
        ctx,
      );

      expect(result.data?.count).toBe(1);
      expect(canonicalIds(result.data)).toEqual(['reply-polling-x']);
    });
  });

  describe('installSystemWorkflow', () => {
    it('requires a canonicalId', async () => {
      const result = await handler.installSystemWorkflow({}, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toBe('canonicalId is required');
      expect(systemWorkflowCatalogService.install).not.toHaveBeenCalled();
    });

    it('installs the catalog entry into the current organization and brand', async () => {
      systemWorkflowCatalogService.install.mockResolvedValue({
        id: 'wf-new',
        label: 'Daily Trends Digest',
        schedule: '0 8 * * *',
      });

      const result = await handler.installSystemWorkflow(
        { canonicalId: 'daily-trends-digest' },
        ctx,
      );

      expect(systemWorkflowCatalogService.install).toHaveBeenCalledWith({
        brandId: 'brand-1',
        canonicalId: 'daily-trends-digest',
        organizationId: 'org-1',
        userId: 'user-1',
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        canonicalId: 'daily-trends-digest',
        editorUrl: '/automation/workflows/wf-new',
        id: 'wf-new',
        label: 'Daily Trends Digest',
      });
    });

    it('does not look up brands when no explicit brandId is supplied', async () => {
      systemWorkflowCatalogService.install.mockResolvedValue({ id: 'wf-new' });

      await handler.installSystemWorkflow(
        { canonicalId: 'daily-trends-digest' },
        ctx,
      );

      expect(brandsService.findOne).not.toHaveBeenCalled();
    });

    it('prefers an explicit brandId that belongs to the organization', async () => {
      brandsService.findOne.mockResolvedValue({ id: 'brand-2' });
      systemWorkflowCatalogService.install.mockResolvedValue({ id: 'wf-new' });

      const result = await handler.installSystemWorkflow(
        { brandId: 'brand-2', canonicalId: 'daily-trends-digest' },
        ctx,
      );

      expect(brandsService.findOne).toHaveBeenCalledWith({
        id: 'brand-2',
        organizationId: 'org-1',
      });
      expect(systemWorkflowCatalogService.install).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'brand-2' }),
      );
      expect(result.success).toBe(true);
    });

    it('rejects a brandId that belongs to another organization', async () => {
      brandsService.findOne.mockResolvedValue(null);
      systemWorkflowCatalogService.install.mockResolvedValue({ id: 'wf-new' });

      const result = await handler.installSystemWorkflow(
        { brandId: 'foreign-brand', canonicalId: 'daily-trends-digest' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Brand is not available in this organization');
      expect(systemWorkflowCatalogService.install).not.toHaveBeenCalled();
    });

    it('surfaces a non-installable catalog entry as a failed tool result', async () => {
      systemWorkflowCatalogService.install.mockRejectedValue(
        new BadRequestException(
          'Catalog entry "system-action-publish" is not user-installable. Product system actions are created on demand.',
        ),
      );

      const result = await handler.installSystemWorkflow(
        { canonicalId: 'system-action-publish' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not user-installable');
    });
  });
});
