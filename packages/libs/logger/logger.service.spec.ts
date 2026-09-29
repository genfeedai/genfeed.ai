import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Logger as winstonLogger } from 'winston';

describe('LoggerService', () => {
  let service: LoggerService;
  let mockWinston: Mocked<winstonLogger>;

  beforeEach(async () => {
    mockWinston = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        {
          provide: 'winston',
          useValue: mockWinston,
        },
      ],
    }).compile();

    service = module.get<LoggerService>(LoggerService);
  });

  describe('log', () => {
    it('should call winston.info with message and context', () => {
      const message = 'Test log message';
      const context = { service: 'test' };

      service.log(message, context);

      expect(mockWinston.info).toHaveBeenCalledWith(message, context);
    });
  });

  describe('warn', () => {
    it('should call winston.warn with message and context', () => {
      const message = 'Test warning message';
      const context = { service: 'test' };

      service.warn(message, context);

      expect(mockWinston.warn).toHaveBeenCalledWith(message, context);
    });
  });

  describe('debug', () => {
    it('should call winston.debug with formatted message and context', () => {
      const message = 'Test debug message';
      const context = { operation: 'test-op', service: 'test' };

      service.debug(message, context);

      expect(mockWinston.debug).toHaveBeenCalledWith(
        '[test.test-op] Test debug message',
        context,
      );
    });
  });

  describe('error', () => {
    it('should call winston.error with original message when no service/operation', () => {
      const message = 'Test error message';
      const trace = new Error('Test error');
      const context = { other: 'data' };

      service.error(message, trace, context);

      expect(mockWinston.error).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          error: expect.objectContaining({
            stack: expect.stringContaining('Test error'),
          }),
          other: 'data',
        }),
      );
    });

    it('redacts a structured message instead of throwing', () => {
      service.error({ apiKey: 'raw-secret', message: 'Provider failed' });

      expect(mockWinston.error).toHaveBeenCalledWith('Provider failed', {
        error: { apiKey: '[REDACTED]', message: 'Provider failed' },
      });
    });
  });

  describe('context normalization', () => {
    it('wraps a string context into a service object', () => {
      service.log('String context message', 'MyService');

      expect(mockWinston.info).toHaveBeenCalledWith('String context message', {
        service: 'MyService',
      });
    });
  });

  describe('error serialization', () => {
    it('omits error data when no trace is provided', () => {
      service.error('No trace message');

      expect(mockWinston.error).toHaveBeenCalledWith('No trace message', {});
    });

    it('extracts non-enumerable axios error properties', () => {
      const axiosError = new Error('Request failed') as Error & {
        code?: string;
        config?: { method?: string; url?: string };
        isAxiosError?: boolean;
        response?: { data?: unknown; status?: number };
        status?: number;
      };
      axiosError.isAxiosError = true;
      axiosError.status = 404;
      axiosError.code = 'ERR_BAD_REQUEST';
      axiosError.response = { data: { error: 'missing' }, status: 404 };
      axiosError.config = { method: 'get', url: 'https://api.example/things' };

      service.error('Axios failure', axiosError);

      expect(mockWinston.error).toHaveBeenCalledWith(
        'Axios failure',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'ERR_BAD_REQUEST',
            message: 'Request failed',
            request: { method: 'get', url: 'https://api.example/things' },
            response: { data: { error: 'missing' }, status: 404 },
            status: 404,
          }),
        }),
      );
    });

    it('redacts secrets from serialized errors and provider responses', () => {
      const axiosError = new Error(
        'Provider rejected api_key=raw-provider-key',
      ) as Error & {
        isAxiosError?: boolean;
        response?: { data?: unknown; status?: number };
      };
      axiosError.isAxiosError = true;
      axiosError.response = {
        data: { accessToken: 'raw-access-token' },
        status: 401,
      };

      service.error('OAuth failed with Bearer raw-bearer-token', axiosError);

      expect(mockWinston.error).toHaveBeenCalledWith(
        'OAuth failed with Bearer [REDACTED]',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Provider rejected api_key=[REDACTED]',
            response: {
              data: { accessToken: '[REDACTED]' },
              status: 401,
            },
          }),
        }),
      );
    });
  });
});
