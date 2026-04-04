import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import {
  type PollOptions,
  PollUntilService,
} from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

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
