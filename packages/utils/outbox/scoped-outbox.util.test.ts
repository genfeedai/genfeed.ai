import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScopedOutbox,
  type ScopedOutboxFailureResolution,
  type ScopedOutboxStorage,
} from './scoped-outbox.util';

type Failure = 'failed' | 'error';

class RejectedError extends Error {}

interface Note {
  text: string;
}

function makeStorage(): ScopedOutboxStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function makeOutbox(
  storage: ScopedOutboxStorage,
  overrides: {
    action?: ScopedOutboxFailureResolution<Failure>['action'];
    markSavedOnRevert?: boolean;
  } = {},
) {
  const logError = vi.fn();
  const outbox = createScopedOutbox<Note, Note, Failure>(
    {
      classifyFailure: (error) =>
        error instanceof RejectedError
          ? {
              action: overrides.action ?? 'drop-write',
              logMessage: 'rejected',
              status: 'failed',
            }
          : null,
      fromStored: (stored) =>
        typeof stored.note === 'object' && stored.note !== null
          ? (stored.note as Note)
          : null,
      idleTimeoutMessage: 'idle timed out',
      logError,
      markSavedOnRevert: overrides.markSavedOnRevert,
      retryLogMessage: 'retrying',
      retryStatus: 'error',
      serialize: (note) => JSON.stringify(note),
      storageKeyPrefix: 'test.outbox',
      toStored: ({ ownerId, payload }, { baseKeys }) => ({
        baseKeys,
        note: payload,
        ownerId,
      }),
    },
    { getStorage: () => storage, idleTimeoutMs: 1500 },
  );
  return { logError, outbox };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('createScopedOutbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps one queue per scope and writes each scope independently', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi.fn().mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'one' }, { write });
    outbox.enqueue('b', { text: 'two' }, { write });
    await flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith(
      'a',
      { text: 'one' },
      { isKeepalive: false, ownerId: null },
    );
    expect(write).toHaveBeenCalledWith(
      'b',
      { text: 'two' },
      { isKeepalive: false, ownerId: null },
    );
    expect(outbox.getStatus('a')).toBe('saved');
    expect(outbox.getStatus('b')).toBe('saved');
  });

  it('serializes writes and only sends the newest queued payload', async () => {
    const { outbox } = makeOutbox(makeStorage());
    let release: () => void = () => {};
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    outbox.enqueue('a', { text: '1' }, { write });
    outbox.enqueue('a', { text: '2' }, { write });
    outbox.enqueue('a', { text: '3' }, { write });
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(outbox.hasUnsavedWrites('a')).toBe(true);

    release();
    await flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'a',
      { text: '3' },
      expect.any(Object),
    );
    expect(outbox.hasUnsavedWrites('a')).toBe(false);
  });

  it('retries a transient failure with exponential backoff capped at the max', async () => {
    const { logError, outbox } = makeOutbox(makeStorage());
    const write = vi.fn().mockRejectedValue(new Error('offline'));
    const statuses: string[] = [];
    outbox.subscribe('a', (status) => statuses.push(status));

    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('retrying', expect.any(Error));

    await vi.advanceTimersByTimeAsync(1999);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(4000);
    expect(write).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8000);
    expect(write).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(write).toHaveBeenCalledTimes(5);
    // 2000 * 2^5 exceeds the 30s cap.
    await vi.advanceTimersByTimeAsync(29_999);
    expect(write).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(6);

    expect(statuses).toContain('error');
    expect(outbox.getStatus('a')).toBe('error');
  });

  it('resets the backoff and saves once a retry succeeds', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();
    await vi.advanceTimersByTimeAsync(2000);

    expect(outbox.getStatus('a')).toBe('saved');
    expect(outbox.hasUnsavedWrites('a')).toBe(false);
  });

  it('tries new content immediately instead of waiting for the backoff', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();
    outbox.enqueue('a', { text: 'y' }, { write });
    await flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(outbox.getStatus('a')).toBe('saved');
  });

  it('persists an owned unsent payload until acknowledged, then restores it', async () => {
    const storage = makeStorage();
    const { outbox } = makeOutbox(storage);
    const write = vi.fn().mockRejectedValue(new Error('offline'));

    outbox.enqueue('a', { text: 'x' }, { ownerId: 'user-1', write });
    await flush();

    expect(storage.data.has('test.outbox:a')).toBe(true);
    expect(outbox.readUnsent('a', 'user-1')).toEqual({ text: 'x' });
    expect(outbox.readUnsent('a', 'user-2')).toBeNull();

    const reloaded = makeOutbox(storage).outbox;
    expect(reloaded.readUnsent('a', 'user-1')).toEqual({ text: 'x' });

    write.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.data.has('test.outbox:a')).toBe(false);
    expect(outbox.readUnsent('a', 'user-1')).toBeNull();
  });

  it('records the acknowledged and in-flight keys as the stored base', async () => {
    const storage = makeStorage();
    const { outbox } = makeOutbox(storage);
    outbox.setAcknowledged('a', { text: 'server' });

    outbox.enqueue(
      'a',
      { text: 'x' },
      { ownerId: 'user-1', write: vi.fn().mockRejectedValue(new Error('x')) },
    );
    await flush();
    outbox.enqueue(
      'a',
      { text: 'y' },
      { ownerId: 'user-1', write: vi.fn().mockRejectedValue(new Error('x')) },
    );

    const stored = JSON.parse(storage.data.get('test.outbox:a') ?? '{}');
    expect(stored.baseKeys).toEqual([
      JSON.stringify({ text: 'server' }),
      JSON.stringify({ text: 'x' }),
    ]);
    expect(stored.ownerId).toBe('user-1');
  });

  it('does not store a payload without an owner', async () => {
    const storage = makeStorage();
    const { outbox } = makeOutbox(storage);

    outbox.enqueue(
      'a',
      { text: 'x' },
      { write: vi.fn().mockRejectedValue(new Error('offline')) },
    );
    await flush();

    expect(storage.data.size).toBe(0);
  });

  it('survives a storage that throws or is unavailable', async () => {
    const throwing: ScopedOutboxStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const { outbox } = makeOutbox(throwing);
    const write = vi.fn().mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'x' }, { ownerId: 'user-1', write });
    await flush();

    expect(write).toHaveBeenCalledTimes(1);
    expect(outbox.getStatus('a')).toBe('saved');
    expect(outbox.readUnsent('a', 'user-1')).toBeNull();
  });

  it('ignores a stored record that does not match the owner or shape', () => {
    const storage = makeStorage();
    const { outbox } = makeOutbox(storage);

    storage.data.set('test.outbox:a', 'not json');
    expect(outbox.readUnsent('a', 'user-1')).toBeNull();
    storage.data.set(
      'test.outbox:a',
      JSON.stringify({ ownerId: 'user-1', note: 'bad' }),
    );
    expect(outbox.readUnsent('a', 'user-1')).toBeNull();
  });

  describe('rejected writes', () => {
    it('drops a rejected write, logs it and moves on to newer content', async () => {
      const storage = makeStorage();
      const { logError, outbox } = makeOutbox(storage);
      const write = vi.fn().mockRejectedValueOnce(new RejectedError('4xx'));
      write.mockResolvedValue(undefined);

      outbox.enqueue('a', { text: 'x' }, { ownerId: 'user-1', write });
      await flush();

      expect(write).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith('rejected', expect.any(Error));
      expect(outbox.getStatus('a')).toBe('failed');
      expect(outbox.hasUnsavedWrites('a')).toBe(false);
      expect(storage.data.size).toBe(0);

      outbox.enqueue('a', { text: 'y' }, { write });
      await flush();
      expect(outbox.getStatus('a')).toBe('saved');
    });

    it('does not retry a rejected write on a timer', async () => {
      const { outbox } = makeOutbox(makeStorage());
      const write = vi.fn().mockRejectedValue(new RejectedError('4xx'));

      outbox.enqueue('a', { text: 'x' }, { write });
      await flush();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(write).toHaveBeenCalledTimes(1);
    });

    it('holds a rejected write queued and stored without retrying', async () => {
      const storage = makeStorage();
      const { outbox } = makeOutbox(storage, { action: 'hold' });
      const write = vi.fn().mockRejectedValue(new RejectedError('4xx'));

      outbox.enqueue('a', { text: 'x' }, { ownerId: 'user-1', write });
      await flush();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(write).toHaveBeenCalledTimes(1);
      expect(outbox.getStatus('a')).toBe('failed');
      expect(outbox.hasUnsavedWrites('a')).toBe(true);
      expect(storage.data.has('test.outbox:a')).toBe(true);
    });

    it('drops everything queued for a drop-all failure', async () => {
      const storage = makeStorage();
      const { outbox } = makeOutbox(storage, { action: 'drop-all' });
      let reject: (error: Error) => void = () => {};
      const write = vi.fn().mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, rej) => {
            reject = rej;
          }),
      );

      outbox.enqueue('a', { text: 'x' }, { ownerId: 'user-1', write });
      outbox.enqueue('a', { text: 'newer' }, { ownerId: 'user-1', write });
      reject(new RejectedError('locked'));
      await flush();

      expect(write).toHaveBeenCalledTimes(1);
      expect(outbox.hasUnsavedWrites('a')).toBe(false);
      expect(storage.data.size).toBe(0);
    });
  });

  it('skips a write that matches what the server acknowledged', async () => {
    const storage = makeStorage();
    const { outbox } = makeOutbox(storage);
    const write = vi.fn().mockResolvedValue(undefined);
    outbox.setAcknowledged('a', { text: 'server' });

    outbox.enqueue('a', { text: 'server' }, { ownerId: 'user-1', write });
    await flush();

    expect(write).not.toHaveBeenCalled();
    expect(storage.data.size).toBe(0);
  });

  it('flips a failed scope to saved when content reverts, if enabled', async () => {
    const { outbox } = makeOutbox(makeStorage(), { markSavedOnRevert: true });
    outbox.setAcknowledged('a', { text: 'server' });
    const failing = vi.fn().mockRejectedValue(new Error('offline'));

    outbox.enqueue('a', { text: 'x' }, { write: failing });
    await flush();
    expect(outbox.getStatus('a')).toBe('error');

    outbox.enqueue('a', { text: 'server' }, { write: failing });
    expect(outbox.getStatus('a')).toBe('saved');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('leaves the status alone on revert by default', async () => {
    const { outbox } = makeOutbox(makeStorage());
    outbox.setAcknowledged('a', { text: 'server' });
    const failing = vi.fn().mockRejectedValue(new Error('offline'));

    outbox.enqueue('a', { text: 'x' }, { write: failing });
    await flush();
    outbox.enqueue('a', { text: 'server' }, { write: failing });

    expect(outbox.getStatus('a')).toBe('error');
  });

  it('passes the keepalive flag to the next write only', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi.fn().mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'x' }, { isKeepalive: true, write });
    await flush();
    outbox.enqueue('a', { text: 'y' }, { write });
    await flush();

    expect(write.mock.calls[0]?.[2]).toEqual({
      isKeepalive: true,
      ownerId: null,
    });
    expect(write.mock.calls[1]?.[2]).toEqual({
      isKeepalive: false,
      ownerId: null,
    });
  });

  it('settle writes queued content now and reports the resulting status', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();

    await expect(outbox.settle('a')).resolves.toBe('saved');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('settle reports a failed status without looping forever', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi.fn().mockRejectedValue(new Error('offline'));

    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();

    await expect(outbox.settle('a')).resolves.toBe('error');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('whenIdle resolves after the queue drains and rejects past its deadline', async () => {
    const { outbox } = makeOutbox(makeStorage());
    await expect(outbox.whenIdle('a')).resolves.toBeUndefined();

    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();

    const idle = outbox.whenIdle('a');
    const outcome = idle.then(
      () => 'idle',
      (error: Error) => error.message,
    );
    await vi.advanceTimersByTimeAsync(1500);
    await expect(outcome).resolves.toBe('idle timed out');

    const retried = outbox.whenIdle('a');
    await vi.advanceTimersByTimeAsync(1500);
    await expect(retried).resolves.toBeUndefined();
  });

  it('discardForeign drops queued writes left by another owner', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const write = vi.fn().mockRejectedValue(new Error('offline'));

    outbox.enqueue('a', { text: 'x' }, { ownerId: 'user-1', write });
    outbox.enqueue('b', { text: 'y' }, { ownerId: 'user-2', write });
    await flush();

    outbox.discardForeign('user-2');

    expect(outbox.hasUnsavedWrites('a')).toBe(false);
    expect(outbox.hasUnsavedWrites('b')).toBe(true);
  });

  it('notifies subscribers until they unsubscribe', async () => {
    const { outbox } = makeOutbox(makeStorage());
    const listener = vi.fn();
    const unsubscribe = outbox.subscribe('a', listener);
    const write = vi.fn().mockResolvedValue(undefined);

    outbox.enqueue('a', { text: 'x' }, { write });
    await flush();
    expect(listener.mock.calls.map(([status]) => status)).toEqual([
      'saving',
      'saved',
    ]);

    unsubscribe();
    outbox.enqueue('a', { text: 'y' }, { write });
    await flush();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
