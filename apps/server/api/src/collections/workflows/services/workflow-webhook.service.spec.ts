import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowWebhookService', () => {
  const prisma = {
    $queryRaw: vi.fn(),
    workflow: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const configService = {
    apiUrl: 'https://api.test.genfeed.ai',
  };
  const workflowsService = {
    findOne: vi.fn(),
  };
  const legacyWorkflowStepRunner = {
    executeWorkflow: vi.fn(),
  };
  const workflowExecutorService = {
    executeManualWorkflow: vi.fn(),
  };

  let service: WorkflowWebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowWebhookService(
      prisma as never,
      logger as never,
      configService as never,
      workflowsService as never,
      legacyWorkflowStepRunner as never,
      workflowExecutorService as never,
    );
  });

  describe('generateWebhook', () => {
    it('stores webhook credentials on the workflow config and returns the trigger URL', async () => {
      prisma.workflow.findFirst.mockResolvedValue({
        config: { existing: true },
        id: 'workflow-1',
      });
      prisma.workflow.update.mockResolvedValue({});

      const result = await service.generateWebhook('workflow-1', 'secret');

      expect(result.webhookId).toMatch(/^wh_/);
      expect(result.webhookSecret).toMatch(/^whsec_/);
      expect(result.authType).toBe('secret');
      expect(result.webhookUrl).toBe(
        `https://api.test.genfeed.ai/v1/webhooks/${result.webhookId}`,
      );
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          config: expect.objectContaining({
            existing: true,
            webhookAuthType: 'secret',
            webhookId: result.webhookId,
            webhookSecret: result.webhookSecret,
          }),
        },
        where: { id: 'workflow-1' },
      });
    });

    it('omits the secret when authType is none', async () => {
      prisma.workflow.findFirst.mockResolvedValue({
        config: {},
        id: 'workflow-1',
      });
      prisma.workflow.update.mockResolvedValue({});

      const result = await service.generateWebhook('workflow-1', 'none');

      expect(result.webhookSecret).toBeNull();
    });

    it('throws when the workflow does not exist', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);

      await expect(service.generateWebhook('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteWebhook', () => {
    it('resets all webhook config fields', async () => {
      prisma.workflow.findFirst.mockResolvedValue({
        config: { webhookId: 'wh_1', webhookSecret: 'whsec_x' },
        id: 'workflow-1',
      });
      prisma.workflow.update.mockResolvedValue({});

      await service.deleteWebhook('workflow-1');

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          config: expect.objectContaining({
            webhookAuthType: 'secret',
            webhookId: null,
            webhookLastTriggeredAt: null,
            webhookSecret: null,
            webhookTriggerCount: 0,
          }),
        },
        where: { id: 'workflow-1' },
      });
    });
  });

  describe('findByWebhookId', () => {
    it('resolves the workflow through a database-side config filter', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'workflow-1' }]);
      workflowsService.findOne.mockResolvedValue({ id: 'workflow-1' });

      const result = await service.findByWebhookId('wh_1');

      expect(result).toEqual({ id: 'workflow-1' });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(workflowsService.findOne).toHaveBeenCalledWith({
        _id: 'workflow-1',
        isDeleted: false,
      });
    });

    it('returns null when no workflow matches', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.findByWebhookId('wh_missing');

      expect(result).toBeNull();
      expect(workflowsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('triggerViaWebhook', () => {
    const nodeWorkflow = {
      _id: { toString: () => 'workflow-1' },
      config: { webhookId: 'wh_1' },
      nodes: [{ id: 'node-1' }],
      organization: 'org-1',
      user: 'user-1',
      webhookTriggerCount: 2,
    };

    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'workflow-1' }]);
      prisma.workflow.findFirst.mockResolvedValue({
        config: { webhookId: 'wh_1' },
        id: 'workflow-1',
      });
      prisma.workflow.update.mockResolvedValue({});
    });

    it('routes node workflows through the workflow executor and bumps trigger stats', async () => {
      workflowsService.findOne.mockResolvedValue(nodeWorkflow);
      workflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'run-1',
        status: 'started',
      });

      const result = await service.triggerViaWebhook('wh_1', { foo: 'bar' });

      expect(result).toEqual({ runId: 'run-1', status: 'started' });
      expect(
        workflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        'workflow-1',
        'user-1',
        'org-1',
        { foo: 'bar' },
        { triggerSource: 'webhook', webhookId: 'wh_1' },
        WorkflowExecutionTrigger.API,
      );
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          config: expect.objectContaining({
            webhookTriggerCount: 3,
          }),
        },
        where: { id: 'workflow-1' },
      });
      expect(legacyWorkflowStepRunner.executeWorkflow).not.toHaveBeenCalled();
    });

    it('routes step-only workflows through the legacy step runner', async () => {
      workflowsService.findOne.mockResolvedValue({
        ...nodeWorkflow,
        nodes: [],
      });
      legacyWorkflowStepRunner.executeWorkflow.mockResolvedValue(undefined);

      const result = await service.triggerViaWebhook('wh_1', {});

      expect(result).toEqual({ runId: 'workflow-1', status: 'started' });
      expect(legacyWorkflowStepRunner.executeWorkflow).toHaveBeenCalledWith(
        'workflow-1',
      );
      expect(
        workflowExecutorService.executeManualWorkflow,
      ).not.toHaveBeenCalled();
    });

    it('rejects triggering workflows without an owner', async () => {
      workflowsService.findOne.mockResolvedValue({
        ...nodeWorkflow,
        organization: undefined,
        user: undefined,
      });

      await expect(service.triggerViaWebhook('wh_1', {})).rejects.toThrow(
        'Systemic workflow templates cannot be executed directly',
      );
    });

    it('throws when the webhook does not resolve to a workflow', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.triggerViaWebhook('wh_missing', {})).rejects.toThrow(
        'Webhook not found or workflow deleted',
      );
    });
  });
});
