import {
  buildToolConfirmationCacheKey,
  readPendingToolConfirmation,
  verifyPendingToolConfirmation,
} from '@api/services/agent-orchestrator/tools/agent-tool-pending-confirmation.util';
import type { CacheService } from '@api/services/cache/cache.service';
import { describe, expect, it, vi } from 'vitest';

const pending = {
  organizationId: 'org-1',
  sourceActionId: 'publish-post-1',
  threadId: 'thread-1',
  toolName: 'create_post',
};

/**
 * A publish card raised outside a thread persists `threadId: ''`. The record
 * must still parse, and verification must still bind the empty thread by
 * equality — a forged or mismatched sourceActionId is rejected either way.
 */
describe('readPendingToolConfirmation', () => {
  it('accepts a persisted record with an empty threadId', () => {
    expect(readPendingToolConfirmation({ ...pending, threadId: '' })).toEqual({
      ...pending,
      threadId: '',
    });
  });

  it.each([
    ['missing threadId', { ...pending, threadId: undefined }],
    ['blank sourceActionId', { ...pending, sourceActionId: '   ' }],
    ['non-object', 'publish-post-1'],
    ['array', [pending]],
  ])('rejects %s', (_label, value) => {
    expect(readPendingToolConfirmation(value)).toBeNull();
  });
});

describe('verifyPendingToolConfirmation', () => {
  function cacheWith(value: unknown): CacheService {
    return { get: vi.fn(async () => value) } as unknown as CacheService;
  }

  it('matches a threadless card by its empty threadId', async () => {
    const threadless = { ...pending, threadId: '' };
    const cacheService = cacheWith(threadless);

    await expect(
      verifyPendingToolConfirmation(cacheService, threadless),
    ).resolves.toBe(true);
    expect(cacheService.get).toHaveBeenCalledWith(
      buildToolConfirmationCacheKey(threadless),
    );
  });

  it('rejects a card persisted for a different thread', async () => {
    const cacheService = cacheWith({ ...pending, threadId: 'thread-2' });

    await expect(
      verifyPendingToolConfirmation(cacheService, pending),
    ).resolves.toBe(false);
  });

  it('rejects an unknown sourceActionId', async () => {
    await expect(
      verifyPendingToolConfirmation(cacheWith(null), pending),
    ).resolves.toBe(false);
  });
});
