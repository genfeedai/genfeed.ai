import type { StudioGenerateDraftPayload } from '@pages/studio/generate/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStudioGenerateDraftOutbox,
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
      { isKeepalive: true },
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
      { isKeepalive: false },
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
});
