import { WebhooksController } from '@api/collections/workflows/controllers/webhooks.controller';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('WebhooksController', () => {
  let controller: WebhooksController;

  const mockWorkflow = {
    _id: { toString: () => 'workflow123' },
    webhookAuthType: 'secret',
    webhookSecret: 'my-secret-key',
  };

  const mockWorkflowsService = {
    findByWebhookId: vi.fn(),
    triggerViaWebhook: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triggerWebhook', () => {
    it('should throw 404 when webhook not found', async () => {
      mockWorkflowsService.findByWebhookId.mockResolvedValue(null);

      await expect(
        controller.triggerWebhook('nonexistent', {}),
      ).rejects.toThrow(HttpException);
    });

    describe('secret auth', () => {
      it('should trigger workflow with valid secret', async () => {
        mockWorkflowsService.findByWebhookId.mockResolvedValue(mockWorkflow);
        mockWorkflowsService.triggerViaWebhook.mockResolvedValue({
          runId: 'run123',
          status: 'queued',
        });

        const result = await controller.triggerWebhook(
          'webhook123',
          { key: 'value' },
          'my-secret-key',
        );

        expect(result.data.runId).toBe('run123');
        expect(result.data.message).toBe('Workflow execution queued');
      });

      it('should throw 401 when secret header is missing', async () => {
        mockWorkflowsService.findByWebhookId.mockResolvedValue(mockWorkflow);

        await expect(
          controller.triggerWebhook('webhook123', {}),
        ).rejects.toThrow(HttpException);
      });

      it('should throw 401 when secret is invalid', async () => {
        mockWorkflowsService.findByWebhookId.mockResolvedValue(mockWorkflow);

        await expect(
          controller.triggerWebhook('webhook123', {}, 'wrong-secret'),
        ).rejects.toThrow(HttpException);
      });
    });

    describe('bearer auth', () => {
      const bearerWorkflow = {
        ...mockWorkflow,
        webhookAuthType: 'bearer',
        webhookSecret: 'my-bearer-token',
      };

      it('should trigger workflow with valid bearer token', async () => {
        mockWorkflowsService.findByWebhookId.mockResolvedValue(bearerWorkflow);
        mockWorkflowsService.triggerViaWebhook.mockResolvedValue({
          runId: 'run123',
          status: 'queued',
        });

        const result = await controller.triggerWebhook(
          'webhook123',
          {},
          undefined,
          'Bearer my-bearer-token',
        );

        expect(result.data.runId).toBe('run123');
      });

      it('should throw 401 when auth header is missing', async () => {
        mockWorkflowsService.findByWebhookId.mockResolvedValue(bearerWorkflow);

        await expect(
          controller.triggerWebhook('webhook123', {}),
        ).rejects.toThrow(HttpException);
      });

      it('should throw 401 when bearer token is invalid', async () => {
        mockWorkflowsService.findByWebhookId.mockResolvedValue(bearerWorkflow);

        await expect(
          controller.triggerWebhook(
            'webhook123',
            {},
            undefined,
            'Bearer wrong-token',
          ),
        ).rejects.toThrow(HttpException);
      });
    });

    describe('no auth', () => {
      it('should trigger workflow without authentication', async () => {
        const noAuthWorkflow = { ...mockWorkflow, webhookAuthType: 'none' };
        mockWorkflowsService.findByWebhookId.mockResolvedValue(noAuthWorkflow);
        mockWorkflowsService.triggerViaWebhook.mockResolvedValue({
          runId: 'run123',
          status: 'queued',
        });

        const result = await controller.triggerWebhook('webhook123', {
          data: 'test',
        });

        expect(result.data.runId).toBe('run123');
      });
    });

    it('should throw 500 when workflow trigger fails', async () => {
      const noAuthWorkflow = { ...mockWorkflow, webhookAuthType: 'none' };
      mockWorkflowsService.findByWebhookId.mockResolvedValue(noAuthWorkflow);
      mockWorkflowsService.triggerViaWebhook.mockRejectedValue(
        new Error('Trigger failed'),
      );

      await expect(controller.triggerWebhook('webhook123', {})).rejects.toThrow(
        HttpException,
      );
    });
  });
});
