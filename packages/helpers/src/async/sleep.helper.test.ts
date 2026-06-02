import { describe, expect, it, vi } from 'vitest';
import { sleep } from './sleep.helper';

describe('sleep', () => {
  it('resolves after the requested duration', async () => {
    vi.useFakeTimers();

    try {
      const promise = sleep(250);
      const resolved = vi.fn();
      promise.then(resolved);

      vi.advanceTimersByTime(249);
      await Promise.resolve();
      expect(resolved).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      await promise;
      expect(resolved).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
