import type { LoggerService } from '@libs/logger/logger.service';
import {
  PollAbortException,
  PollTimeoutException,
} from './poll-until.exception';
import { PollUntilService } from './poll-until.service';

describe('PollUntilService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const service = new PollUntilService(logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves on the first attempt when the predicate already passes', async () => {
    const fn = vi.fn().mockResolvedValue('done');

    const result = await service.poll(fn, (value) => value === 'done');

    expect(result.value).toBe('done');
    expect(result.attempts).toBe(1);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Poll resolved after 1 attempt(s)'),
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('keeps polling until the predicate passes', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('pending')
      .mockResolvedValue('done');

    const result = await service.poll(fn, (value) => value === 'done', {
      intervalMs: 1,
    });

    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws PollTimeoutException once the deadline passes', async () => {
    const fn = vi.fn().mockResolvedValue('pending');

    await expect(
      service.poll(fn, () => false, { intervalMs: 1, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(PollTimeoutException);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Poll timed out'),
      expect.objectContaining({ timeoutMs: 20 }),
    );
  });

  it('carries the configured timeout on the timeout exception', async () => {
    const fn = vi.fn().mockResolvedValue('pending');

    const error = await service
      .poll(fn, () => false, { intervalMs: 1, timeoutMs: 15 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PollTimeoutException);
    expect((error as PollTimeoutException).timeoutMs).toBe(15);
    expect((error as PollTimeoutException).name).toBe('PollTimeoutException');
  });

  it('never invokes the function when the timeout is already elapsed', async () => {
    const fn = vi.fn().mockResolvedValue('pending');

    await expect(
      service.poll(fn, () => true, { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(PollTimeoutException);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects when the signal fires after a poll attempt resolves', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
      return 'pending';
    });

    await expect(
      service.poll(fn, () => false, {
        intervalMs: 1,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(PollAbortException);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('poll-until exceptions', () => {
  it('exposes the default abort message', () => {
    const error = new PollAbortException();

    expect(error.message).toBe('Poll aborted');
    expect(error.name).toBe('PollAbortException');
    expect(error).toBeInstanceOf(Error);
  });

  it('records the timeout budget on the timeout exception', () => {
    const error = new PollTimeoutException('too slow', 1_234);

    expect(error.message).toBe('too slow');
    expect(error.timeoutMs).toBe(1_234);
    expect(error).toBeInstanceOf(Error);
  });
});
