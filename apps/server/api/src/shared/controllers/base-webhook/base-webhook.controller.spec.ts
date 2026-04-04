import {
  BaseWebhookController,
  type WebhookValidationResult,
} from '@api/shared/controllers/base-webhook/base-webhook.controller';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

// Concrete subclass for testing abstract base
class TestWebhookController extends BaseWebhookController {
  public validateResult: WebhookValidationResult = {
    event: { type: 'test.event' },
    isValid: true,
  };
  public processShouldThrow: boolean = false;

  constructor(loggerService: LoggerService) {
    super(loggerService, 'TestWebhookController');
  }

  protected async validateSignature<T>(
    _request: Request,
    _payload?: unknown,
  ): Promise<WebhookValidationResult<T>> {
    return this.validateResult as WebhookValidationResult<T>;
  }

  protected async processWebhook<T>(event: T, _url: string): Promise<void> {
    if (this.processShouldThrow) {
      throw new Error('Processing failed');
    }
  }

  // Expose protected method for testing
  public callHandleWebhook(
    request: Request,
    payload?: unknown,
    options?: { processAsync?: boolean },
  ) {
    return this.handleWebhook(request, payload, options);
  }

  public callHandleWebhookWithRawBody(request: Request) {
    return this.handleWebhookWithRawBody(request);
  }

  public callGetLogUrl(method?: string) {
    return this.getLogUrl(method);
  }
}

describe('BaseWebhookController', () => {
  let controller: TestWebhookController;
  let loggerService: vi.Mocked<LoggerService>;

  const mockRequest = {
    body: Buffer.from(JSON.stringify({ event: 'test' })),
    headers: {},
  } as unknown as Request;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
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

    loggerService = module.get(LoggerService);
    controller = new TestWebhookController(loggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleWebhook', () => {
    it('should return success when signature is valid', async () => {
      controller.validateResult = {
        event: { type: 'test' },
        isValid: true,
      };

      const result = await controller.callHandleWebhook(mockRequest, {});

      expect(result).toEqual({ success: true });
    });

    it('should throw HttpException with UNAUTHORIZED when signature is invalid', async () => {
      controller.validateResult = {
        error: 'Bad signature',
        isValid: false,
      };

      await expect(controller.callHandleWebhook(mockRequest)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.callHandleWebhook(mockRequest);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.UNAUTHORIZED,
        );
      }
    });

    it('should use default error message when validation error is not set', async () => {
      controller.validateResult = { isValid: false };

      await expect(controller.callHandleWebhook(mockRequest)).rejects.toThrow(
        'Invalid webhook signature',
      );
    });

    it('should log receipt and validation', async () => {
      controller.validateResult = { event: {}, isValid: true };

      await controller.callHandleWebhook(mockRequest, { foo: 'bar' });

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('received'),
        { foo: 'bar' },
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('webhook validated'),
        expect.anything(),
      );
    });

    it('should return success with detail when processAsync is true', async () => {
      controller.validateResult = { event: {}, isValid: true };

      const result = await controller.callHandleWebhook(
        mockRequest,
        {},
        {
          processAsync: true,
        },
      );

      expect(result).toEqual({ detail: 'Webhook received', success: true });
    });

    it('should throw INTERNAL_SERVER_ERROR when processWebhook throws non-HttpException', async () => {
      controller.validateResult = { event: {}, isValid: true };
      controller.processShouldThrow = true;

      await expect(controller.callHandleWebhook(mockRequest)).rejects.toThrow(
        HttpException,
      );

      try {
        controller.processShouldThrow = true;
        await controller.callHandleWebhook(mockRequest);
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });

    it('should re-throw HttpException from processWebhook as-is', async () => {
      // If validateSignature itself throws HttpException, it should be re-thrown
      controller.validateResult = {
        error: 'Forbidden',
        isValid: false,
      };

      await expect(controller.callHandleWebhook(mockRequest)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('handleWebhookWithRawBody', () => {
    it('should parse raw buffer body and delegate to handleWebhook', async () => {
      const payload = { event: 'raw.test' };
      const rawRequest = {
        body: Buffer.from(JSON.stringify(payload)),
        headers: {},
      } as unknown as Request;

      controller.validateResult = { event: payload, isValid: true };

      const result = await controller.callHandleWebhookWithRawBody(rawRequest);

      expect(result).toEqual({ success: true });
    });
  });

  describe('getLogUrl', () => {
    it('should include constructorName in log URL', () => {
      const url = controller.callGetLogUrl('myMethod');

      expect(url).toContain('TestWebhookController');
      expect(url).toContain('myMethod');
    });
  });
});
