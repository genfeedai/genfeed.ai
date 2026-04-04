import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { of, throwError } from 'rxjs';

import {
  WebhookClientProcessor,
  type WebhookJobData,
} from './webhook-client.processor';

const makeJob = (data: Partial<WebhookJobData> = {}): Job<WebhookJobData> =>
  ({
    attemptsMade: 0,
    data: {
      endpoint: 'https://example.com/webhook',
      ingredientId: 'ing-1',
      organizationId: 'org-1',
      payload: {
        event: 'ingredient.completed',
        timestamp: '2024-01-01T00:00:00Z',
      },
      secret: 'my-secret',
      ...data,
    },
    id: 'wh-job-1',
    opts: { attempts: 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Job<WebhookJobData>;

describe('WebhookClientProcessor', () => {
  let processor: WebhookClientProcessor;
  let httpService: { post: ReturnType<typeof vi.fn> };
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  beforeEach(async () => {
    httpService = { post: vi.fn() };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookClientProcessor,
        { provide: HttpService, useValue: httpService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    processor = module.get<WebhookClientProcessor>(WebhookClientProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('process', () => {
    it('delivers webhook successfully on 2xx response', async () => {
      httpService.post.mockReturnValue(of({ data: {}, status: 200 }));
      const job = makeJob();
      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('webhook delivered'),
        expect.objectContaining({ statusCode: 200 }),
      );
    });

    it('sends correct headers including HMAC signature', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      httpService.post.mockImplementation(
        (
          _url: string,
          _body: unknown,
          config: { headers: Record<string, string> },
        ) => {
          capturedHeaders = config.headers;
          return of({ data: {}, status: 200 });
        },
      );
      await processor.process(makeJob());
      expect(capturedHeaders?.['X-Genfeed-Event']).toBe('ingredient.completed');
      expect(capturedHeaders?.['X-Genfeed-Signature']).toMatch(
        /^sha256=[a-f0-9]{64}$/,
      );
      expect(capturedHeaders?.['X-Genfeed-Delivery']).toBe('wh-job-1');
    });

    it('warns on 4xx responses (delivered but rejected)', async () => {
      httpService.post.mockReturnValue(of({ data: {}, status: 400 }));
      const job = makeJob();
      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('rejected'),
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('does NOT warn on 2xx response', async () => {
      httpService.post.mockReturnValue(of({ data: {}, status: 201 }));
      await processor.process(makeJob());
      expect(loggerService.warn).not.toHaveBeenCalled();
    });

    it('rethrows network errors to trigger BullMQ retry', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({ code: 'ECONNREFUSED', message: 'ECONNREFUSED' })),
      );
      const job = makeJob();
      await expect(processor.process(job)).rejects.toMatchObject({
        message: 'ECONNREFUSED',
      });
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('delivery failed'),
        expect.any(Object),
      );
    });

    it('generates different HMAC signatures for different secrets', async () => {
      const signatures: string[] = [];
      httpService.post.mockImplementation(
        (
          _url: string,
          _body: unknown,
          config: { headers: Record<string, string> },
        ) => {
          signatures.push(config.headers['X-Genfeed-Signature']);
          return of({ data: {}, status: 200 });
        },
      );
      await processor.process(makeJob({ secret: 'secret-A' }));
      await processor.process(makeJob({ secret: 'secret-B' }));
      expect(signatures[0]).not.toBe(signatures[1]);
    });

    it('updates progress through processing lifecycle', async () => {
      httpService.post.mockReturnValue(of({ data: {}, status: 200 }));
      const job = makeJob();
      await processor.process(job);
      const progressCalls = (
        job.updateProgress as ReturnType<typeof vi.fn>
      ).mock.calls.map(([p]: [number]) => p);
      expect(progressCalls).toContain(10);
      expect(progressCalls).toContain(30);
      expect(progressCalls).toContain(100);
    });

    it('includes ingredientId in log context when provided', async () => {
      httpService.post.mockReturnValue(of({ data: {}, status: 200 }));
      await processor.process(makeJob({ ingredientId: 'ing-specific' }));
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ingredientId: 'ing-specific' }),
      );
    });

    it('handles missing ingredientId gracefully', async () => {
      httpService.post.mockReturnValue(of({ data: {}, status: 200 }));
      const job = makeJob({ ingredientId: undefined });
      await expect(processor.process(job)).resolves.toBeUndefined();
    });
  });
});
