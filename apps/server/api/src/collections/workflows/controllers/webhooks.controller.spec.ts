import { WebhooksController } from '@api/collections/workflows/controllers/webhooks.controller';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const UNAUTHORIZED_BODY = { error: 'Unauthorized', status: 401 };

async function expectUnauthorized(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    expect.fail('Expected triggerWebhook to reject with 401');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const httpError = error as HttpException;
    expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(httpError.getResponse()).toEqual(UNAUTHORIZED_BODY);
  }
}

describe('WebhooksController', () => {
  let controller: WebhooksController;

  const mockWorkflow = {
    id: { toString: () => 'workflow123' },
    webhookAuthType: 'secret',
    webhookSecret: 'my-secret-key',
  };

  const mockWorkflowWebhookService = {
    findByWebhookId: vi.fn(),
    triggerViaWebhook: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WorkflowWebhookService,
          useValue: mockWorkflowWebhookService,
        },
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

  describe('triggerWebhook', () => {
    it('rejects with the generic 401 when webhook is not found (no existence oracle)', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(null);

      await expectUnauthorized(controller.triggerWebhook('nonexistent', {}));
    });

    describe('secret auth', () => {
      it('should trigger workflow with valid secret', async () => {
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
          mockWorkflow,
        );
        mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
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
    });

    describe('bearer auth', () => {
      const bearerWorkflow = {
        ...mockWorkflow,
        webhookAuthType: 'bearer',
        webhookSecret: 'my-bearer-token',
      };

      it.each([
        ['lowercase', 'bearer my-bearer-token'],
        ['mixed case', 'BeArEr my-bearer-token'],
      ])(
        // RFC 7235: scheme names are case-insensitive.
        'accepts a %s bearer scheme',
        async (_label, authorization) => {
          mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
            bearerWorkflow,
          );
          mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
            runId: 'run123',
            status: 'queued',
          });

          const result = await controller.triggerWebhook(
            'webhook123',
            {},
            undefined,
            authorization,
          );

          expect(result.data.runId).toBe('run123');
        },
      );

      it.each([
        ['invalid token', 'Bearer wrong-token'],
        ['surplus fields', 'Bearer my-bearer-token extra'],
        ['wrong scheme', 'Basic my-bearer-token'],
        ['single field', 'Bearer'],
      ])(
        // Regression coverage for #5206: a naive
        // `startsWith('Bearer ')`/`substring(7)` parse either missed a
        // differently-cased scheme or silently kept surplus fields as part
        // of the "token" (which then just failed the secret compare instead
        // of being rejected outright as malformed).
        'rejects with the generic 401 for a %s Authorization header',
        async (_label, authorization) => {
          mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
            bearerWorkflow,
          );

          await expectUnauthorized(
            controller.triggerWebhook(
              'webhook123',
              {},
              undefined,
              authorization,
            ),
          );
        },
      );
    });

    it('returns a generic 500 message and logs the real error, without leaking error.message', async () => {
      const noAuthWorkflow = { ...mockWorkflow, webhookAuthType: 'none' };
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
        noAuthWorkflow,
      );
      const sensitiveError = new Error(
        'Prisma: connection string postgres://user:pw@host/db failed',
      );
      mockWorkflowWebhookService.triggerViaWebhook.mockRejectedValue(
        sensitiveError,
      );

      try {
        await controller.triggerWebhook('webhook123', {});
        expect.fail('Expected triggerWebhook to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        const response = httpError.getResponse() as { error: string };
        expect(response.error).toBe('Failed to trigger workflow');
        expect(response.error).not.toContain('postgres://');
      }
    });
  });
});
