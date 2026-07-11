import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PollAbortException,
  PollTimeoutException,
} from '@server/shared/services/poll-until/poll-until.exception';
import {
  type PollOptions,
  PollUntilService,
} from '@server/shared/services/poll-until/poll-until.service';

describe('PollUntilService', () => {
  let service: PollUntilService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollUntilService,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PollUntilService>(PollUntilService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('poll()', () => {
    it('resolves immediately when isDone returns true on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('completed');
      const isDone = (v: string) => v === 'completed';

      const promise = service.poll(fn, isDone, {
        intervalMs: 100,
        timeoutMs: 5_000,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toBe('completed');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('polls multiple times before isDone returns true', async () => {
      const responses = ['pending', 'pending', 'completed'];
      let callCount = 0;
      const fn = vi
        .fn()
        .mockImplementation(async () => responses[callCount++] ?? 'completed');
      const isDone = (v: string) => v === 'completed';

      const promise = service.poll(fn, isDone, {
        intervalMs: 100,
        timeoutMs: 5_000,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toBe('completed');
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws PollTimeoutException when timeout is reached', async () => {
      const fn = vi.fn().mockResolvedValue('pending');
      const isDone = (_v: string) => false;

      const promise = service.poll(fn, isDone, {
        intervalMs: 100,
        timeoutMs: 300,
      });
      const timeoutExpectation =
        expect(promise).rejects.toThrow(PollTimeoutException);
      const payloadExpectation = expect(promise).rejects.toMatchObject({
        timeoutMs: 300,
      });

      await vi.runAllTimersAsync();

      await timeoutExpectation;
      await payloadExpectation;
    });

    it('uses default intervalMs and timeoutMs when options not provided', async () => {
      const fn = vi.fn().mockResolvedValue('done');
      const isDone = (v: string) => v === 'done';

      const promise = service.poll(fn, isDone);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toBe('done');
    });

    it('propagates errors thrown by fn without catching them', async () => {
      const error = new Error('API unavailable');
      const fn = vi.fn().mockRejectedValue(error);
      const isDone = (_v: unknown) => false;

      const promise = service.poll(fn, isDone, {
        intervalMs: 100,
        timeoutMs: 5_000,
      });
      const rejectionExpectation =
        expect(promise).rejects.toThrow('API unavailable');

      await vi.runAllTimersAsync();

      await rejectionExpectation;
    });

    it('applies exponential backoff when backoff > 1', async () => {
      const responses = ['a', 'a', 'a', 'done'];
      let callCount = 0;
      const fn = vi
        .fn()
        .mockImplementation(async () => responses[callCount++] ?? 'done');
      const isDone = (v: string) => v === 'done';

      const options: PollOptions = {
        backoff: 2,
        intervalMs: 100,
        maxIntervalMs: 400,
        timeoutMs: 10_000,
      };

      const promise = service.poll(fn, isDone, options);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toBe('done');
      expect(result.attempts).toBe(4);
    });

    it('caps backoff interval at maxIntervalMs', async () => {
      const responses = Array.from({ length: 5 }, (_, i) =>
        i === 4 ? 'done' : 'pending',
      );
      let callCount = 0;
      const fn = vi
        .fn()
        .mockImplementation(async () => responses[callCount++] ?? 'done');
      const isDone = (v: string) => v === 'done';

      const options: PollOptions = {
        backoff: 10,
        intervalMs: 100,
        maxIntervalMs: 200,
        timeoutMs: 60_000,
      };

      const promise = service.poll(fn, isDone, options);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toBe('done');
      expect(result.attempts).toBe(5);
    });

    it('works with typed generic values (number predicate)', async () => {
      let counter = 0;
      const fn = vi.fn().mockImplementation(async () => ++counter);
      const isDone = (v: number) => v >= 3;

      const promise = service.poll(fn, isDone, {
        intervalMs: 50,
        timeoutMs: 5_000,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toBe(3);
      expect(result.attempts).toBe(3);
    });

    it('works with typed generic values (object predicate)', async () => {
      const states = [
        { status: 'queued' },
        { status: 'processing' },
        { outputUrl: 'https://cdn.example.com/video.mp4', status: 'completed' },
      ];
      let callCount = 0;
      const fn = vi.fn().mockImplementation(async () => states[callCount++]);
      const isDone = (v: { status: string }) => v.status === 'completed';

      const promise = service.poll(fn, isDone, {
        intervalMs: 100,
        timeoutMs: 5_000,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.value).toEqual({
        outputUrl: 'https://cdn.example.com/video.mp4',
        status: 'completed',
      });
      expect(result.attempts).toBe(3);
    });
  });

  describe('poll() — provider failure via predicate', () => {
    it('propagates an error thrown by isDone (terminal failure status)', async () => {
      // The pattern every migrated loop (Comfy/FAL/managed) uses: a terminal
      // failure surfaces as a thrown error, not a timeout.
      const fn = vi.fn().mockResolvedValue({ status: 'FAILED' });
      const isDone = (v: { status: string }) => {
        if (v.status === 'FAILED') {
          throw new Error('provider reported failure');
        }
        return v.status === 'COMPLETED';
      };

      const promise = service.poll(fn, isDone, {
        intervalMs: 100,
        timeoutMs: 5_000,
      });
      const expectation = expect(promise).rejects.toThrow(
        'provider reported failure',
      );
      await vi.runAllTimersAsync();
      await expectation;
      // Failure is raised on the first attempt, before any wait.
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('poll() — cancellation', () => {
    it('rejects with PollAbortException without calling fn when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = vi.fn().mockResolvedValue('pending');

      const promise = service.poll(fn, () => false, {
        intervalMs: 100,
        timeoutMs: 5_000,
        signal: controller.signal,
      });

      await expect(promise).rejects.toBeInstanceOf(PollAbortException);
      expect(fn).not.toHaveBeenCalled();
    });

    it('rejects with PollAbortException when aborted while waiting between attempts', async () => {
      const controller = new AbortController();
      const fn = vi.fn().mockResolvedValue('pending');

      const promise = service.poll(fn, () => false, {
        intervalMs: 1_000,
        timeoutMs: 60_000,
        signal: controller.signal,
      });
      const expectation =
        expect(promise).rejects.toBeInstanceOf(PollAbortException);

      // Run the first attempt and enter the wait, then abort mid-wait.
      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
      await vi.runAllTimersAsync();

      await expectation;
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('rejects when aborted during an in-flight attempt', async () => {
      const controller = new AbortController();
      let resolveAttempt: ((value: string) => void) | undefined;
      const fn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveAttempt = resolve;
          }),
      );

      const promise = service.poll(fn, () => true, {
        intervalMs: 100,
        timeoutMs: 5_000,
        signal: controller.signal,
      });
      const expectation =
        expect(promise).rejects.toBeInstanceOf(PollAbortException);

      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
      resolveAttempt?.('completed');

      await expectation;
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('PollTimeoutException', () => {
    it('has correct name and message', () => {
      const err = new PollTimeoutException('timed out', 5_000);
      expect(err.name).toBe('PollTimeoutException');
      expect(err.message).toBe('timed out');
      expect(err.timeoutMs).toBe(5_000);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PollTimeoutException);
    });
  });
});
