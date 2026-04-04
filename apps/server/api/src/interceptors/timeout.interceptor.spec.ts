import { TimeoutInterceptor } from '@api/interceptors/timeout.interceptor';
import {
  CallHandler,
  ExecutionContext,
  RequestTimeoutException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  defaultIfEmpty,
  delay,
  firstValueFrom,
  lastValueFrom,
  of,
  TimeoutError,
  throwError,
} from 'rxjs';

describe('TimeoutInterceptor', () => {
  let interceptor: TimeoutInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimeoutInterceptor],
    }).compile();

    interceptor = module.get<TimeoutInterceptor>(TimeoutInterceptor);

    mockExecutionContext = {
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getClass: vi.fn(),
      getHandler: vi.fn(),
      getType: vi.fn(),
      switchToHttp: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    } as ExecutionContext;

    mockCallHandler = {
      handle: vi.fn(),
    } as CallHandler;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should pass through successful responses within timeout', async () => {
    const mockResponse = { data: 'test' };
    mockCallHandler.handle = vi.fn().mockReturnValue(of(mockResponse));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    const value = await firstValueFrom(result$);
    expect(value).toEqual(mockResponse);
    expect(mockCallHandler.handle).toHaveBeenCalled();
  });

  it('should throw RequestTimeoutException when request times out', async () => {
    vi.useFakeTimers();

    mockCallHandler.handle = vi
      .fn()
      .mockReturnValue(of('response').pipe(delay(31000)));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    const promise = firstValueFrom(result$);
    vi.advanceTimersByTime(31000);

    await expect(promise).rejects.toBeInstanceOf(RequestTimeoutException);
    expect(mockCallHandler.handle).toHaveBeenCalled();
    vi.useRealTimers();
  }, 35000);

  it('should handle TimeoutError and throw RequestTimeoutException', async () => {
    const timeoutError = new TimeoutError();
    mockCallHandler.handle = vi
      .fn()
      .mockReturnValue(throwError(() => timeoutError));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    await expect(firstValueFrom(result$)).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
  });

  it('should pass through other errors unchanged', async () => {
    const customError = new Error('Custom error');
    mockCallHandler.handle = vi
      .fn()
      .mockReturnValue(throwError(() => customError));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    await expect(firstValueFrom(result$)).rejects.toBe(customError);
  });

  it('should handle multiple subscribers', () => {
    const mockResponse = { data: 'test' };
    mockCallHandler.handle = vi.fn().mockReturnValue(of(mockResponse));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    result$.subscribe(subscriber1);
    result$.subscribe(subscriber2);

    expect(subscriber1).toHaveBeenCalledWith(mockResponse);
    expect(subscriber2).toHaveBeenCalledWith(mockResponse);
  });

  it('should complete the observable after successful response', async () => {
    const mockResponse = { data: 'test' };
    mockCallHandler.handle = vi.fn().mockReturnValue(of(mockResponse));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    const value = await lastValueFrom(result$);
    expect(value).toEqual(mockResponse);
  });

  it('should handle empty observable', async () => {
    mockCallHandler.handle = vi.fn().mockReturnValue(of());

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );

    const value = await lastValueFrom(result$.pipe(defaultIfEmpty(undefined)));
    expect(value).toBeUndefined();
  });

  it('should timeout after exactly 30 seconds', () => {
    vi.useFakeTimers();

    mockCallHandler.handle = vi
      .fn()
      .mockReturnValue(of('response').pipe(delay(30001)));

    const result$ = interceptor.intercept(
      mockExecutionContext,
      mockCallHandler,
    );
    let errorThrown = false;

    result$.subscribe({
      error: (error) => {
        errorThrown = true;
        expect(error).toBeInstanceOf(RequestTimeoutException);
      },
      next: () => {
        /* noop */
      },
    });

    vi.advanceTimersByTime(29999);
    expect(errorThrown).toBe(false);

    vi.advanceTimersByTime(2);
    expect(errorThrown).toBe(true);

    vi.useRealTimers();
  });

  it('should handle synchronous errors from handler', () => {
    const syncError = new Error('Synchronous error');
    mockCallHandler.handle = vi.fn().mockImplementation(() => {
      throw syncError;
    });

    expect(() =>
      interceptor.intercept(mockExecutionContext, mockCallHandler),
    ).toThrow(syncError);
  });

  describe('edge cases', () => {
    it('should handle null response', async () => {
      mockCallHandler.handle = vi.fn().mockReturnValue(of(null));

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const value = await firstValueFrom(result$);
      expect(value).toBeNull();
    });

    it('should handle array responses', async () => {
      const mockArray = [1, 2, 3];
      mockCallHandler.handle = vi.fn().mockReturnValue(of(mockArray));

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const value = await firstValueFrom(result$);
      expect(value).toEqual(mockArray);
    });

    it('should preserve error stack traces', async () => {
      const customError = new Error('Custom error with stack');
      customError.stack = 'Custom stack trace';
      mockCallHandler.handle = vi
        .fn()
        .mockReturnValue(throwError(() => customError));

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await expect(firstValueFrom(result$)).rejects.toMatchObject({
        stack: 'Custom stack trace',
      });
    });
  });
});
