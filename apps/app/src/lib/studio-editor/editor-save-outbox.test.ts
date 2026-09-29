import { IngredientFormat } from '@genfeedai/contracts';
import type {
  EditorProjectContent,
  EditorSaveStatus,
  EditorSaveStorage,
} from '@props/studio/editor-save.props';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEditorSaveOutbox,
  EditorSaveConflictError,
  EditorSaveRejectedError,
  serializeEditorProjectContent,
} from './editor-save-outbox';

function makeContent(name: string): EditorProjectContent {
  return {
    name,
    settings: {
      backgroundColor: '#000000',
      format: IngredientFormat.LANDSCAPE,
      fps: 30,
      height: 1080,
      width: 1920,
    },
    totalDurationFrames: 300,
    tracks: [],
  };
}

function makeStorage(): EditorSaveStorage & { data: Map<string, string> } {
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

function deferred() {
  let resolve: (value?: unknown) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe('editor save outbox', () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializes content independently of object key order', () => {
    const content = makeContent('Reel');
    const reordered = {
      totalDurationFrames: content.totalDurationFrames,
      tracks: content.tracks,
      settings: {
        width: 1920,
        height: 1080,
        fps: 30,
        format: IngredientFormat.LANDSCAPE,
        backgroundColor: '#000000',
      },
      name: 'Reel',
    };

    expect(serializeEditorProjectContent(reordered)).toBe(
      serializeEditorProjectContent(content),
    );
  });

  it('writes the latest content and reports saving then saved', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const write = vi.fn().mockResolvedValue(undefined);
    const statuses: EditorSaveStatus[] = [];
    outbox.subscribe('p1', (status) => statuses.push(status));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    expect(outbox.hasUnsavedEdits('p1')).toBe(true);
    await flushMicrotasks();

    expect(write).toHaveBeenCalledWith('p1', makeContent('A'), {
      isKeepalive: false,
    });
    expect(statuses).toEqual(['saving', 'saved']);
    expect(outbox.hasUnsavedEdits('p1')).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('reports nothing unsaved by the time the last write is acknowledged', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const write = vi.fn().mockResolvedValue(undefined);
    const unsavedWhenSaved: boolean[] = [];
    outbox.subscribe('p1', (status) => {
      if (status === 'saved') {
        unsavedWhenSaved.push(outbox.hasUnsavedEdits('p1'));
      }
    });

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    await outbox.settle('p1');

    expect(unsavedWhenSaved).toEqual([false]);
  });

  it('serializes writes and only sends the newest content queued during one', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const first = deferred();
    const write = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    outbox.enqueue('p1', makeContent('B'), { ownerId: 'u1', write });
    outbox.enqueue('p1', makeContent('C'), { ownerId: 'u1', write });
    expect(write).toHaveBeenCalledTimes(1);

    first.resolve();
    await flushMicrotasks();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('p1', makeContent('C'), {
      isKeepalive: false,
    });
  });

  it('skips a write when the content is what the server already holds', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const write = vi.fn().mockResolvedValue(undefined);
    outbox.setAcknowledged('p1', makeContent('A'));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    await flushMicrotasks();

    expect(write).not.toHaveBeenCalled();
    expect(outbox.hasUnsavedEdits('p1')).toBe(false);
  });

  it('keeps a failed edit, reports the failure and retries it with backoff', async () => {
    vi.useFakeTimers();
    const outbox = createEditorSaveOutbox({
      getStorage: () => storage,
      retryBaseMs: 1000,
    });
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const statuses: EditorSaveStatus[] = [];
    outbox.subscribe('p1', (status) => statuses.push(status));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    await flushMicrotasks();

    expect(statuses).toEqual(['saving', 'failed']);
    expect(outbox.hasUnsavedEdits('p1')).toBe(true);
    expect(outbox.readUnsent('p1', 'u1')?.content).toEqual(makeContent('A'));

    await vi.advanceTimersByTimeAsync(1000);

    expect(write).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(['saving', 'failed', 'saving', 'saved']);
    expect(outbox.hasUnsavedEdits('p1')).toBe(false);
    expect(outbox.readUnsent('p1', 'u1')).toBeNull();
  });

  it('keeps a rejected edit locally without retrying it on a timer', async () => {
    vi.useFakeTimers();
    const outbox = createEditorSaveOutbox({
      getStorage: () => storage,
      retryBaseMs: 1000,
    });
    const write = vi
      .fn()
      .mockRejectedValue(new EditorSaveRejectedError('rejected'));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(write).toHaveBeenCalledTimes(1);
    expect(outbox.getStatus('p1')).toBe('failed');
    expect(outbox.hasUnsavedEdits('p1')).toBe(true);
    expect(outbox.readUnsent('p1', 'u1')?.content).toEqual(makeContent('A'));
  });

  it('drops the queue and reports a conflict when the server refuses updates', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const write = vi
      .fn()
      .mockRejectedValue(new EditorSaveConflictError('locked'));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    await flushMicrotasks();

    expect(outbox.getStatus('p1')).toBe('conflict');
    expect(outbox.hasUnsavedEdits('p1')).toBe(false);
    expect(outbox.readUnsent('p1', 'u1')).toBeNull();
  });

  it('passes the keepalive request on to the next write', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const write = vi.fn().mockResolvedValue(undefined);

    outbox.enqueue('p1', makeContent('A'), {
      isKeepalive: true,
      ownerId: 'u1',
      write,
    });
    await flushMicrotasks();

    expect(write).toHaveBeenCalledWith('p1', makeContent('A'), {
      isKeepalive: true,
    });
  });

  it('stores an unsent edit with the server versions it was made on top of', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const inFlight = deferred();
    const write = vi.fn().mockReturnValue(inFlight.promise);
    outbox.setAcknowledged('p1', makeContent('Server'));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    outbox.enqueue('p1', makeContent('B'), { ownerId: 'u1', write });

    const unsent = outbox.readUnsent('p1', 'u1');
    expect(unsent?.content).toEqual(makeContent('B'));
    expect(unsent?.baseKeys).toEqual(
      expect.arrayContaining([
        serializeEditorProjectContent(makeContent('Server')),
        serializeEditorProjectContent(makeContent('A')),
      ]),
    );
  });

  it('never replays another user’s unsent edit', () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    outbox.enqueue('p1', makeContent('A'), {
      ownerId: 'u1',
      write: () => new Promise(() => undefined),
    });

    expect(outbox.readUnsent('p1', 'u2')).toBeNull();
    expect(outbox.readUnsent('p1', 'u1')?.content).toEqual(makeContent('A'));
  });

  it('settles a queued edit immediately, skipping the retry delay', async () => {
    vi.useFakeTimers();
    const outbox = createEditorSaveOutbox({
      getStorage: () => storage,
      retryBaseMs: 30_000,
    });
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });
    await flushMicrotasks();
    expect(outbox.getStatus('p1')).toBe('failed');

    await expect(outbox.settle('p1')).resolves.toBe('saved');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('settles with the failure when the write still fails', async () => {
    const outbox = createEditorSaveOutbox({ getStorage: () => storage });
    const write = vi.fn().mockRejectedValue(new Error('offline'));

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });

    await expect(outbox.settle('p1')).resolves.toBe('failed');
  });

  it('keeps saving after a full or blocked storage', async () => {
    const outbox = createEditorSaveOutbox({
      getStorage: () => ({
        getItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('quota');
        },
      }),
    });
    const write = vi.fn().mockResolvedValue(undefined);

    outbox.enqueue('p1', makeContent('A'), { ownerId: 'u1', write });

    await expect(outbox.settle('p1')).resolves.toBe('saved');
    expect(outbox.readUnsent('p1', 'u1')).toBeNull();
  });
});
