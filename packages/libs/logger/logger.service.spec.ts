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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have constructorName set', () => {
    expect(service.constructorName).toBe('LoggerService');
  });

  describe('log', () => {
    it('should call winston.info with message and context', () => {
      const message = 'Test log message';
      const context = { service: 'test' };

      service.log(message, context);

      expect(mockWinston.info).toHaveBeenCalledWith(message, context);
    });

    it('should call winston.info with message only when no context', () => {
      const message = 'Test log message';

      service.log(message);

      expect(mockWinston.info).toHaveBeenCalledWith(message, undefined);
    });
  });

  describe('warn', () => {
    it('should call winston.warn with message and context', () => {
      const message = 'Test warning message';
      const context = { service: 'test' };

      service.warn(message, context);

      expect(mockWinston.warn).toHaveBeenCalledWith(message, context);
    });

    it('should call winston.warn with message only when no context', () => {
      const message = 'Test warning message';

      service.warn(message);

      expect(mockWinston.warn).toHaveBeenCalledWith(message, undefined);
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

    it('should call winston.debug with original message when no service/operation', () => {
      const message = 'Test debug message';
      const context = { other: 'data' };

      service.debug(message, context);

      expect(mockWinston.debug).toHaveBeenCalledWith(message, context);
    });

    it('should call winston.debug with original message when no context', () => {
      const message = 'Test debug message';

      service.debug(message);

      expect(mockWinston.debug).toHaveBeenCalledWith(message, undefined);
    });
  });

  describe('error', () => {
    it('should call winston.error with formatted message', () => {
      const message = 'Test error message';
      const trace = new Error('Test error');
      const context = { operation: 'test-op', service: 'test' };

      service.error(message, trace, context);

      expect(mockWinston.error).toHaveBeenCalledWith(
        '[test.test-op] Test error message',
        expect.objectContaining({
          error: expect.objectContaining({
            stack: expect.stringContaining('Test error'),
          }),
          operation: 'test-op',
          service: 'test',
        }),
      );
    });

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

    it('should call winston.error with original message when no context', () => {
      const message = 'Test error message';
      const trace = new Error('Test error');

      service.error(message, trace);

      expect(mockWinston.error).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          error: expect.objectContaining({
            stack: expect.stringContaining('Test error'),
          }),
        }),
      );
    });

    it('serializes an Error passed as the message by Nest lifecycle hooks', () => {
      const lifecycleError = new TypeError('Shutdown failed');

      service.error(lifecycleError);

      expect(mockWinston.error).toHaveBeenCalledWith(
        'Shutdown failed',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Shutdown failed',
            name: 'TypeError',
            stack: expect.stringContaining('Shutdown failed'),
          }),
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

    it('drops non-object non-string contexts', () => {
      service.warn('Numeric context message', 42);

      expect(mockWinston.warn).toHaveBeenCalledWith(
        'Numeric context message',
        undefined,
      );
    });

    it('redacts secrets from messages and nested context values', () => {
      service.log('Connected with access_token=raw-token', {
        nested: { oauthTokenSecret: 'raw-secret' },
        platform: 'twitter',
      });

      expect(mockWinston.info).toHaveBeenCalledWith(
        'Connected with access_token=[REDACTED]',
        {
          nested: { oauthTokenSecret: '[REDACTED]' },
          platform: 'twitter',
        },
      );
    });
  });

  describe('error serialization', () => {
    it('passes non-Error traces through unchanged', () => {
      service.error('Raw trace message', 'string trace');

      expect(mockWinston.error).toHaveBeenCalledWith(
        'Raw trace message',
        expect.objectContaining({ error: 'string trace' }),
      );
    });

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

    it('serializes axios errors without response or config payloads', () => {
      const axiosError = new Error('Network down') as Error & {
        isAxiosError?: boolean;
      };
      axiosError.isAxiosError = true;

      service.error('Axios network failure', axiosError);

      expect(mockWinston.error).toHaveBeenCalledWith(
        'Axios network failure',
        expect.objectContaining({
          error: expect.objectContaining({ message: 'Network down' }),
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

  describe('formatMessage', () => {
    it('should format message with service and operation', () => {
      const message = 'Test message';
      const context = { operation: 'test-op', service: 'test' };

      const result = service.formatMessage(message, context);

      expect(result).toBe('[test.test-op] Test message');
    });

    it('should format message with service only', () => {
      const message = 'Test message';
      const context = { service: 'test' };

      const result = service.formatMessage(message, context);

      expect(result).toBe('[test] Test message');
    });

    it('should format message with operation only', () => {
      const message = 'Test message';
      const context = { operation: 'test-op' };

      const result = service.formatMessage(message, context);

      expect(result).toBe('[test-op] Test message');
    });

    it('should return original message when no service or operation', () => {
      const message = 'Test message';
      const context = { other: 'data' };

      const result = service.formatMessage(message, context);

      expect(result).toBe('Test message');
    });

    it('should return original message when no context', () => {
      const message = 'Test message';

      const result = service.formatMessage(message);

      expect(result).toBe('Test message');
    });
  });
});
