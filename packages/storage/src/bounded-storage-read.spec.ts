import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectBoundedStorageBytes,
  createStorageReadContext,
  normalizeStorageReadError,
  observeStorageReadBody,
  STORAGE_READ_MAX_BYTES,
  StorageReadError,
} from './bounded-storage-read';

afterEach(() => vi.useRealTimers());
describe('bounded payload collection and cancellation ownership', () => {
  it.each([
    0,
    -1,
    0.5,
    STORAGE_READ_MAX_BYTES + 1,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects byte budget %s before allocation', (maxBytes) => {
    expect(() =>
      createStorageReadContext({ maxBytes, timeoutMs: 100 }),
    ).toThrow('storage_read_invalid_options');
  });
  it.each([0, -1, 0.5, 30001])('rejects deadline %s', (timeoutMs) => {
    expect(() => createStorageReadContext({ maxBytes: 1, timeoutMs })).toThrow(
      'storage_read_invalid_options',
    );
  });
  it('validates runtime signal, preserves first cancellation, and disposes timer/listener', () => {
    vi.useFakeTimers();
    expect(() =>
      createStorageReadContext({
        maxBytes: 1,
        timeoutMs: 1,
        signal: {} as AbortSignal,
      }),
    ).toThrow('storage_read_invalid_options');
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const context = createStorageReadContext({
      maxBytes: 1,
      timeoutMs: 100,
      signal: controller.signal,
    });
    controller.abort();
    context.abort('storage_read_changed');
    vi.advanceTimersByTime(100);
    expect(() => context.throwIfAborted()).toThrow('storage_read_aborted');
    context.dispose();
    context.dispose();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('collects exact boundary and offset byte views without concatenation', async () => {
    const context = createStorageReadContext({
      maxBytes: STORAGE_READ_MAX_BYTES,
      timeoutMs: 30000,
    });
    try {
      expect(
        (
          await collectBoundedStorageBytes(
            Readable.from([Buffer.alloc(STORAGE_READ_MAX_BYTES, 7)]),
            STORAGE_READ_MAX_BYTES,
            context,
          )
        ).length,
      ).toBe(STORAGE_READ_MAX_BYTES);
    } finally {
      context.dispose();
    }
    const view = new Uint8Array([9, 1, 2, 9]).subarray(1, 3);
    const small = createStorageReadContext({ maxBytes: 2, timeoutMs: 1000 });
    try {
      expect(
        await collectBoundedStorageBytes(Readable.from([view]), 2, small),
      ).toEqual(Buffer.from([1, 2]));
    } finally {
      small.dispose();
    }
  });
  it.each([
    {
      size: 1,
      chunks: [Buffer.from([1, 2])],
      code: 'storage_read_limit_exceeded',
    },
    { size: 2, chunks: [Buffer.from([1])], code: 'storage_read_changed' },
    { size: 0, chunks: ['invalid'], code: 'storage_read_invalid_response' },
  ])('destroys dishonest stream with $code', async ({ size, chunks, code }) => {
    const context = createStorageReadContext({ maxBytes: 2, timeoutMs: 1000 });
    const body = Readable.from(chunks);
    try {
      await expect(
        collectBoundedStorageBytes(body, size, context),
      ).rejects.toThrow(code);
      expect(body.destroyed).toBe(true);
      expect(context.signal.aborted).toBe(true);
    } finally {
      context.dispose();
    }
  });
  it('rejects invalid/oversized expected metadata before allocating', async () => {
    for (const expectedSize of [NaN, -1, 3]) {
      const context = createStorageReadContext({
        maxBytes: 2,
        timeoutMs: 1000,
      });
      const body = Readable.from([]);
      const allocate = vi.spyOn(Buffer, 'alloc');
      try {
        await expect(
          collectBoundedStorageBytes(body, expectedSize, context),
        ).rejects.toThrow();
        expect(allocate).not.toHaveBeenCalled();
        expect(body.destroyed).toBe(true);
      } finally {
        allocate.mockRestore();
        context.dispose();
      }
    }
  });
  it('aborts a stalled body by deadline and awaits destruction', async () => {
    vi.useFakeTimers();
    const context = createStorageReadContext({ maxBytes: 1, timeoutMs: 10 });
    const body = new Readable({ read() {} });
    const rejection = expect(
      collectBoundedStorageBytes(body, 1, context),
    ).rejects.toThrow('storage_read_timeout');
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(body.destroyed).toBe(true);
    context.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects already aborted without a read and handles external midstream cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createStorageReadContext({
      maxBytes: 1,
      timeoutMs: 1000,
      signal: controller.signal,
    });
    const read = vi.fn();
    const body = new Readable({ read });
    try {
      await expect(
        collectBoundedStorageBytes(body, 1, context),
      ).rejects.toThrow('storage_read_aborted');
      expect(read).not.toHaveBeenCalled();
    } finally {
      context.dispose();
    }
    const next = new AbortController();
    const active = createStorageReadContext({
      maxBytes: 2,
      timeoutMs: 1000,
      signal: next.signal,
    });
    const stream = new Readable({
      read() {
        this.push(Buffer.from([1]));
        next.abort();
      },
    });
    try {
      await expect(
        collectBoundedStorageBytes(stream, 2, active),
      ).rejects.toThrow('storage_read_aborted');
      expect(stream.destroyed).toBe(true);
    } finally {
      active.dispose();
    }
  });
  it('sanitizes foreign errors without invoking arbitrary coercion', () => {
    const context = createStorageReadContext({ maxBytes: 1, timeoutMs: 100 });
    try {
      const coercion = vi.fn(() => {
        throw new Error('Must not coerce');
      });
      expect(
        normalizeStorageReadError(
          { toString: coercion, secret: 'private' },
          context,
        ).message,
      ).toBe('storage_read_unavailable');
      expect(coercion).not.toHaveBeenCalled();
      expect(
        normalizeStorageReadError(
          { $metadata: { httpStatusCode: 412 } },
          context,
        ).code,
      ).toBe('storage_read_changed');
      const known = new StorageReadError('storage_read_changed');
      expect(normalizeStorageReadError(known, context)).toBe(known);
    } finally {
      context.dispose();
    }
  });
  it('rejects genuine emitClose:false before reading or allocation without a close wait', async () => {
    const context = createStorageReadContext({ maxBytes: 1, timeoutMs: 1000 });
    const read = vi.fn();
    const body = new Readable({ emitClose: false, read });
    const once = vi.spyOn(body, 'once');
    const allocate = vi.spyOn(Buffer, 'alloc');
    try {
      await expect(
        collectBoundedStorageBytes(body, 1, context),
      ).rejects.toThrow('storage_read_invalid_response');
      expect(read).not.toHaveBeenCalled();
      expect(allocate).not.toHaveBeenCalled();
      expect(body.destroyed).toBe(true);
      expect(once.mock.calls.some(([event]) => event === 'close')).toBe(false);
      body.emit('error', new Error('late native error'));
    } finally {
      allocate.mockRestore();
      context.dispose();
    }
  });
  it('runs final stability callback before destroy and waits for delayed native close', async () => {
    const context = createStorageReadContext({ maxBytes: 1, timeoutMs: 1000 });
    let release: (() => void) | undefined;
    let callbackObserved = false;
    let completed = false;
    const body = new Readable({
      autoDestroy: false,
      emitClose: true,
      read() {
        this.push(Buffer.from([1]));
        this.push(null);
      },
      destroy(error, done) {
        release = () => done(error);
      },
    });
    const promise = collectBoundedStorageBytes(body, 1, context, async () => {
      callbackObserved = true;
      expect(body.destroyed).toBe(false);
      expect(body.closed).toBe(false);
    }).then((bytes) => {
      completed = true;
      return bytes;
    });
    try {
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      expect(callbackObserved).toBe(true);
      expect(completed).toBe(false);
      expect(body.closed).toBe(false);
      release?.();
      expect(await promise).toEqual(Buffer.from([1]));
      expect(body.closed).toBe(true);
    } finally {
      context.dispose();
    }
  });
  it('keeps cancellation live during final callback and awaits error-close cleanup', async () => {
    const controller = new AbortController();
    const context = createStorageReadContext({
      maxBytes: 1,
      timeoutMs: 1000,
      signal: controller.signal,
    });
    const body = new Readable({
      autoDestroy: false,
      emitClose: true,
      read() {
        this.push(Buffer.from([1]));
        this.push(null);
      },
    });
    try {
      await expect(
        collectBoundedStorageBytes(body, 1, context, async () => {
          controller.abort();
        }),
      ).rejects.toThrow('storage_read_aborted');
      expect(body.closed).toBe(true);
    } finally {
      context.dispose();
    }
  });
  it('sanitizes callback errors after closing the native body', async () => {
    const context = createStorageReadContext({ maxBytes: 1, timeoutMs: 1000 });
    const body = new Readable({
      autoDestroy: false,
      emitClose: true,
      read() {
        this.push(Buffer.from([1]));
        this.push(null);
      },
    });
    try {
      await expect(
        collectBoundedStorageBytes(body, 1, context, async () => {
          throw new Error('private path');
        }),
      ).rejects.toThrow('storage_read_unavailable');
      expect(body.closed).toBe(true);
    } finally {
      context.dispose();
    }
  });
});

describe('terminal native close ownership', () => {
  it.each(['success', 'changed', 'aborted'] as const)(
    'waits for close and preserves %s outcome',
    async (outcome) => {
      const controller = new AbortController();
      const context = createStorageReadContext({
        maxBytes: 1,
        timeoutMs: 1000,
        signal: controller.signal,
      });
      let release: (() => void) | undefined;
      const destroy = vi.fn(
        (_error: Error | null, done: (error?: Error | null) => void) => {
          release = () => done(new Error('private close failure'));
        },
      );
      const body = new Readable({
        autoDestroy: false,
        emitClose: true,
        read() {
          this.push(Buffer.from([1]));
          this.push(null);
        },
        destroy,
      });
      const lifecycle = observeStorageReadBody(body);
      let settled = false;
      const pending = collectBoundedStorageBytes(
        body,
        1,
        context,
        async () => {
          if (outcome === 'changed')
            throw new StorageReadError('storage_read_changed');
        },
        lifecycle,
      ).then(
        () => {
          settled = true;
          return 'success';
        },
        (error: StorageReadError) => {
          settled = true;
          return error.code;
        },
      );
      try {
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        if (outcome === 'aborted') controller.abort();
        expect(settled).toBe(false);
        release?.();
        expect(await pending).toBe(
          outcome === 'success'
            ? 'storage_read_unavailable'
            : outcome === 'changed'
              ? 'storage_read_changed'
              : 'storage_read_aborted',
        );
        const first = lifecycle.close();
        expect(lifecycle.close()).toBe(first);
        await expect(first).rejects.toThrow('private close failure');
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(body.closed).toBe(true);
      } finally {
        context.dispose();
      }
    },
  );
});

it('does not return bytes when deadline expires during successful native close', async () => {
  vi.useFakeTimers();
  const context = createStorageReadContext({ maxBytes: 1, timeoutMs: 10 });
  let release: (() => void) | undefined;
  let closing: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    closing = resolve;
  });
  const body = new Readable({
    autoDestroy: false,
    emitClose: true,
    read() {
      this.push(Buffer.from([1]));
      this.push(null);
    },
    destroy(_error, done) {
      release = () => done();
      closing?.();
    },
  });
  let settled = false;
  const pending = collectBoundedStorageBytes(body, 1, context).then(
    () => {
      settled = true;
      return 'success';
    },
    (error: StorageReadError) => {
      settled = true;
      return error.code;
    },
  );
  try {
    await started;
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false);
    release?.();
    expect(await pending).toBe('storage_read_timeout');
    expect(body.closed).toBe(true);
  } finally {
    context.dispose();
  }
});
