import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isTransientReadFailure,
  retryTransientRead,
} from './retry-transient-read';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@services/core/logger.service', () => ({ logger: { warn } }));

function statusError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    status,
  });
}

describe('isTransientReadFailure', () => {
  it.each([
    ['a sanitized 502', statusError(502), true],
    ['a sanitized 503', statusError(503), true],
    ['a sanitized 504', statusError(504), true],
    [
      'an axios error carrying a 502 response',
      { response: { status: 502 } },
      true,
    ],
    ['a dropped connection', { code: 'ECONNRESET' }, true],
    ['a timeout', { code: 'ETIMEDOUT' }, true],
    ['a 500', statusError(500), false],
    ['a 401', statusError(401), false],
    ['a 404', statusError(404), false],
    ['a parse failure', new TypeError('bad json'), false],
    ['a thrown string', 'boom', false],
    ['nothing', undefined, false],
  ])('treats %s as transient=%s', (_name, error, expected) => {
    expect(isTransientReadFailure(error)).toBe(expected);
  });
});

describe('retryTransientRead', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    warn.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result of a read that succeeds first time without logging', async () => {
    const read = vi.fn().mockResolvedValue('article');

    await expect(retryTransientRead('article', read)).resolves.toBe('article');
    expect(read).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('recovers from a gateway blip and logs only the status', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(statusError(502))
      .mockResolvedValueOnce('article');

    const result = retryTransientRead('article', read);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('article');
    expect(warn).toHaveBeenCalledWith(
      'Transient public read failure, retrying',
      { attempt: 1, label: 'article', status: 502 },
    );
  });

  it('rethrows the last failure after three attempts', async () => {
    const failure = statusError(502);
    const read = vi.fn().mockRejectedValue(failure);

    const result = retryTransientRead('article', read);
    const assertion = expect(result).rejects.toBe(failure);
    await vi.runAllTimersAsync();

    await assertion;
    expect(read).toHaveBeenCalledTimes(3);
  });

  it.each([404, 500])('does not repeat a %i', async (status) => {
    const failure = statusError(status);
    const read = vi.fn().mockRejectedValue(failure);

    await expect(retryTransientRead('article', read)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
