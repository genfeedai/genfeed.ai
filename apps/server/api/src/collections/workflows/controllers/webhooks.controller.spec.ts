import { WebhooksController } from '@api/collections/workflows/controllers/webhooks.controller';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('is public — the global CombinedAuthGuard must not gate this route ahead of its own secret check (genfeedai/genfeed.ai#5246)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WebhooksController)).toBe(true);
  });

  describe('triggerWebhook', () => {
    it('rejects with the generic 401 when webhook is not found (no existence oracle)', async () => {
      mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(null);

      await expectUnauthorized(controller.triggerWebhook('nonexistent', {}));
    });

    it.each(['Secret', 'hmac', 'HMAC', 'basic'])(
      // BLOCKER regression coverage for #5248: previously only 'secret' and
      // 'bearer' were validated; any other stored value (including a
      // differently-cased 'Secret') fell through both branches and skipped
      // auth entirely.
      'rejects an unrecognized stored webhookAuthType (%s) instead of skipping auth',
      async (authType) => {
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue({
          ...mockWorkflow,
          webhookAuthType: authType,
        });

        await expectUnauthorized(controller.triggerWebhook('webhook123', {}));
        expect(
          mockWorkflowWebhookService.triggerViaWebhook,
        ).not.toHaveBeenCalled();
      },
    );

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

      it('rejects with the generic 401 when secret header is missing', async () => {
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
          mockWorkflow,
        );

        await expectUnauthorized(controller.triggerWebhook('webhook123', {}));
      });

      it('rejects with the generic 401 when secret is invalid', async () => {
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
          mockWorkflow,
        );

        await expectUnauthorized(
          controller.triggerWebhook('webhook123', {}, 'wrong-secret'),
        );
      });

      it('rejects with the generic 401 when the workflow has no stored secret', async () => {
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue({
          ...mockWorkflow,
          webhookSecret: null,
        });

        await expectUnauthorized(
          controller.triggerWebhook('webhook123', {}, 'anything'),
        );
        expect(
          mockWorkflowWebhookService.triggerViaWebhook,
        ).not.toHaveBeenCalled();
      });
    });

    describe('bearer auth', () => {
      const bearerWorkflow = {
        ...mockWorkflow,
        webhookAuthType: 'bearer',
        webhookSecret: 'my-bearer-token',
      };

      it('should trigger workflow with valid bearer token', async () => {
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
          'Bearer my-bearer-token',
        );

        expect(result.data.runId).toBe('run123');
      });

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

      it('rejects with the generic 401 when auth header is missing', async () => {
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
          bearerWorkflow,
        );

        await expectUnauthorized(controller.triggerWebhook('webhook123', {}));
      });

      it.each([
        ['invalid token', 'Bearer wrong-token'],
        ['surplus fields', 'Bearer my-bearer-token extra'],
        ['wrong scheme', 'Basic my-bearer-token'],
        ['single field', 'Bearer'],
      ])(
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

    describe('no auth', () => {
      it('should trigger workflow without authentication', async () => {
        const noAuthWorkflow = { ...mockWorkflow, webhookAuthType: 'none' };
        mockWorkflowWebhookService.findByWebhookId.mockResolvedValue(
          noAuthWorkflow,
        );
        mockWorkflowWebhookService.triggerViaWebhook.mockResolvedValue({
          runId: 'run123',
          status: 'queued',
        });

        const result = await controller.triggerWebhook('webhook123', {
          data: 'test',
        });

        expect(result.data.runId).toBe('run123');
      });
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
