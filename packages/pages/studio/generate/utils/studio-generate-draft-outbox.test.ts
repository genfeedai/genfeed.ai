import type { StudioGenerateDraftPayload } from '@pages/studio/generate/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStudioGenerateDraftOutbox,
  StudioGenerateDraftRejectedError,
  type StudioGenerateDraftWrite,
} from './studio-generate-draft-outbox';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

function payload(prompt: string): StudioGenerateDraftPayload {
  return {
    attachments: [],
    knowledgeSelection: {},
    prompt,
    references: [],
    settingsByType: {},
    type: 'image',
  };
}

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe('createStudioGenerateDraftOutbox', () => {
  let write: ReturnType<typeof vi.fn<StudioGenerateDraftWrite>>;

  function writtenPrompts(): string[] {
    return write.mock.calls.map((call) => call[1].prompt);
  }

  beforeEach(() => {
    write = vi.fn<StudioGenerateDraftWrite>().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes only what the server does not already hold', async () => {
    const outbox = createStudioGenerateDraftOutbox();
    outbox.setAcknowledged('brand-1', payload('A'));

    outbox.enqueue('brand-1', payload('A'), { write });
    await settle();

    expect(write).not.toHaveBeenCalled();
  });

  it('writes the latest composer after an in-flight write, even when it matches the old draft', async () => {
    const outbox = createStudioGenerateDraftOutbox();
    outbox.setAcknowledged('brand-1', payload('A'));
    const writeB = deferred();
    write.mockReturnValueOnce(writeB.promise);

    outbox.enqueue('brand-1', payload('B'), { write });
    outbox.enqueue('brand-1', payload('A'), { write });
    writeB.resolve();
    await settle();

    expect(writtenPrompts()).toEqual(['B', 'A']);
  });

  it('drains a departing write queued behind an in-flight one, with keepalive', async () => {
    const outbox = createStudioGenerateDraftOutbox();
    const writeA = deferred();
    write.mockReturnValueOnce(writeA.promise);

    outbox.enqueue('brand-1', payload('A'), { write });
    // The workspace unmounts here: nothing else will ever call the outbox.
    outbox.enqueue('brand-1', payload('B typed before leaving'), {
      isKeepalive: true,
      write,
    });
    writeA.resolve();
    await settle();

    expect(write).toHaveBeenLastCalledWith(
      'brand-1',
      expect.objectContaining({ prompt: 'B typed before leaving' }),
      { isKeepalive: true, ownerId: null },
    );
    expect(writtenPrompts()).toEqual(['A', 'B typed before leaving']);
  });

  it('keeps brands independent', async () => {
    const outbox = createStudioGenerateDraftOutbox();
    const writeA = deferred();
    write.mockReturnValueOnce(writeA.promise);

    outbox.enqueue('brand-1', payload('A'), { write });
    outbox.enqueue('brand-2', payload('Z'), { write });
    await settle();

    expect(write).toHaveBeenCalledWith(
      'brand-2',
      expect.objectContaining({ prompt: 'Z' }),
      { isKeepalive: false, ownerId: null },
    );
    writeA.resolve();
  });

  it('retries a failed write with backoff and reports each state', async () => {
    vi.useFakeTimers();
    const outbox = createStudioGenerateDraftOutbox({ retryBaseMs: 1000 });
    const statuses: string[] = [];
    outbox.subscribe('brand-1', (status) => statuses.push(status));
    write.mockRejectedValueOnce(new Error('offline'));

    outbox.enqueue('brand-1', payload('A'), { write });
    await settle();
    expect(statuses).toEqual(['saving', 'error']);

    await vi.advanceTimersByTimeAsync(1000);

    expect(writtenPrompts()).toEqual(['A', 'A']);
    expect(statuses).toEqual(['saving', 'error', 'saving', 'saved']);
  });

  it('resolves whenIdle only after the in-flight write lands', async () => {
    const outbox = createStudioGenerateDraftOutbox();
    const writeA = deferred();
    write.mockReturnValueOnce(writeA.promise);
    const isIdle = vi.fn();

    outbox.enqueue('brand-1', payload('A'), { write });
    void outbox.whenIdle('brand-1').then(isIdle);
    await settle();
    expect(isIdle).not.toHaveBeenCalled();

    writeA.resolve();
    await settle();
    expect(isIdle).toHaveBeenCalledTimes(1);
  });

  it('stays busy while a failed write waits on its retry', async () => {
    vi.useFakeTimers();
    const outbox = createStudioGenerateDraftOutbox({ retryBaseMs: 1000 });
    const isIdle = vi.fn();
    write.mockRejectedValueOnce(new Error('offline'));

    outbox.enqueue('brand-1', payload('B'), { write });
    await settle();
    void outbox.whenIdle('brand-1').then(isIdle);
    await settle();
    expect(isIdle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(isIdle).toHaveBeenCalledTimes(1);
  });

  it('keeps an unsent payload in storage until the server acknowledges it', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const outbox = createStudioGenerateDraftOutbox({
      getStorage: () => storage,
    });
    const writeA = deferred();
    write.mockReturnValueOnce(writeA.promise);

    outbox.enqueue('brand-1', payload('A'), { ownerId: 'user-1', write });
    await settle();
    // Teardown here would lose A without the stored copy.
    const nextPage = createStudioGenerateDraftOutbox({
      getStorage: () => storage,
    });
    expect(nextPage.readUnsent('brand-1', 'user-1')?.prompt).toBe('A');
    expect(nextPage.readUnsent('brand-1', 'user-2')).toBeNull();

    writeA.resolve();
    await settle();
    expect(outbox.readUnsent('brand-1', 'user-1')).toBeNull();
  });

  it('ignores a malformed stored payload', () => {
    const outbox = createStudioGenerateDraftOutbox({
      getStorage: () => ({
        getItem: () => '{"ownerId":"user-1","payload":{"prompt":1}}',
        removeItem: () => undefined,
        setItem: () => undefined,
      }),
    });

    expect(outbox.readUnsent('brand-1', 'user-1')).toBeNull();
  });

  it('drops a rejected write instead of retrying it, then writes anything newer', async () => {
    vi.useFakeTimers();
    const outbox = createStudioGenerateDraftOutbox({ retryBaseMs: 1000 });
    const statuses: string[] = [];
    outbox.subscribe('brand-1', (status) => statuses.push(status));
    const writeA = deferred();
    write.mockReturnValueOnce(writeA.promise);

    outbox.enqueue('brand-1', payload('A'), { write });
    outbox.enqueue('brand-1', payload('B'), { write });
    writeA.reject(new StudioGenerateDraftRejectedError('rejected'));
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(writtenPrompts()).toEqual(['A', 'B']);
    expect(statuses).toEqual(['saving', 'failed', 'saving', 'saved']);
  });

  it('never retries a rejected write on its own', async () => {
    vi.useFakeTimers();
    const outbox = createStudioGenerateDraftOutbox({ retryBaseMs: 1000 });
    write.mockRejectedValue(new StudioGenerateDraftRejectedError('rejected'));
    const isIdle = vi.fn();

    outbox.enqueue('brand-1', payload('A'), { write });
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    void outbox.whenIdle('brand-1').then(isIdle);
    await settle();

    expect(write).toHaveBeenCalledTimes(1);
    expect(isIdle).toHaveBeenCalledTimes(1);
  });

  it('passes each write the user who queued it, and drops other users writes on a switch', async () => {
    vi.useFakeTimers();
    const outbox = createStudioGenerateDraftOutbox({
      getStorage: () => null,
      retryBaseMs: 1000,
    });
    write.mockRejectedValueOnce(new Error('offline'));

    outbox.enqueue('brand-1', payload('A'), { ownerId: 'user-1', write });
    await settle();
    expect(write).toHaveBeenCalledWith(
      'brand-1',
      expect.objectContaining({ prompt: 'A' }),
      { isKeepalive: false, ownerId: 'user-1' },
    );

    // user-2 signs in on this tab before the retry fires.
    outbox.discardForeign('user-2');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(write).toHaveBeenCalledTimes(1);
  });
});
