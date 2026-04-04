import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger as winstonLogger } from 'winston';

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
    it('should call winston.error and super.error with formatted message', () => {
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
