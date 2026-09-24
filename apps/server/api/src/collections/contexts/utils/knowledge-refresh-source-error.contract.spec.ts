import {
  extractKnowledgeRefreshSourceText,
  KnowledgeSourceUnavailableException,
} from '@api/collections/contexts/utils/knowledge-refresh-source-error.util';
import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

describe('knowledge refresh source HTTP contract', () => {
  it('returns the safe production JSON:API 422 without reporting to Sentry', async () => {
    const failure = await extractKnowledgeRefreshSourceText({
      category: KnowledgeBaseCategory.URL,
      referenceUrl: 'https://private.invalid/path?token=secret',
      fetchImpl: async () => {
        throw Object.assign(new Error('DNS private.invalid token=secret'), {
          code: 'ENOTFOUND',
        });
      },
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(KnowledgeSourceUnavailableException);
    if (!(failure instanceof KnowledgeSourceUnavailableException))
      throw new Error('Expected source exception');
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
    };
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const request = {
      method: 'POST',
      url: '/contexts/sources/source-1/refresh',
      originalUrl: '/contexts/sources/source-1/refresh',
      headers: {},
      body: {},
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };
    const filter = new HttpExceptionFilter(
      logger as unknown as LoggerService,
      new ConfigService({
        NODE_ENV: 'production',
        SENTRY_ENVIRONMENT: 'production',
      }),
    );
    filter.catch(failure, host as ArgumentsHost);
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      errors: [
        expect.objectContaining({
          code: '422',
          title: 'Knowledge source unavailable',
          detail:
            'The source could not be reached. Check its URL and availability, then try again.',
        }),
      ],
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toMatch(
      /private\.invalid|token=secret|ENOTFOUND/,
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
