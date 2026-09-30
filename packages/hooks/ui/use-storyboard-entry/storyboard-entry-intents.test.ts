import { describe, expect, it, vi } from 'vitest';
import { runStoryboardEntryIntent } from './storyboard-entry-intents';

describe('Storyboard explicit entry intents', () => {
  it('shares the identical pending promise across clicks and entry surfaces', async () => {
    let complete!: (value: { id: string }) => void;
    const create = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          complete = resolve;
        }),
    );
    const first = runStoryboardEntryIntent(
      'org/brand/user/image/asset-double',
      create,
    );
    const second = runStoryboardEntryIntent(
      'org/brand/user/image/asset-double',
      create,
    );
    expect(second).toBe(first);
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(1);
    complete({ id: 'run-one' });
    await expect(first).resolves.toEqual({ id: 'run-one' });
  });

  it('reuses the UUID after ambiguous transport or server failure', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockRejectedValueOnce({ errors: [{ status: '503' }] })
      .mockResolvedValue({ id: 'saved' });
    const key = 'org/brand/user/video/asset-retry';
    await expect(runStoryboardEntryIntent(key, create)).rejects.toThrow(
      'connection lost',
    );
    await expect(runStoryboardEntryIntent(key, create)).rejects.toEqual({
      errors: [{ status: '503' }],
    });
    await expect(runStoryboardEntryIntent(key, create)).resolves.toEqual({
      id: 'saved',
    });
    expect(new Set(create.mock.calls.map(([id]) => id)).size).toBe(1);
    expect(create.mock.calls[0][0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates independent UUIDs after success, definitive failure or changed scope', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'first' })
      .mockRejectedValueOnce({ errors: [{ status: '422' }] })
      .mockResolvedValue({ id: 'next' });
    const key = 'org/brand/user/image/asset-explicit';
    await runStoryboardEntryIntent(key, create);
    await expect(runStoryboardEntryIntent(key, create)).rejects.toBeDefined();
    await runStoryboardEntryIntent(key, create);
    await runStoryboardEntryIntent(
      'other-org/brand/user/image/asset-explicit',
      create,
    );
    expect(new Set(create.mock.calls.map(([id]) => id)).size).toBe(4);
  });
});
