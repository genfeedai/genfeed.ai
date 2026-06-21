import { PostCategory, PostStatus } from '@genfeedai/enums';
import type {
  FastlaneAssetItem,
  FastlaneScheduleTarget,
} from '@genfeedai/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────

const mockPost = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('stub-token'),
}));

vi.mock('@services/content/posts.service', () => ({
  PostsService: {
    getInstance: () => ({ post: mockPost }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockError = vi.fn();
const mockSuccess = vi.fn();
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mockError, success: mockSuccess }),
  },
}));

// Stable crypto.randomUUID shim
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-group-id' },
  writable: true,
});

import { useFastlaneSchedule } from './useFastlaneSchedule';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function makeAsset(
  id: string,
  format: 'image' | 'video' = 'image',
): FastlaneAssetItem {
  return {
    idea: {
      id,
      format,
      hook: `Hook for ${id}`,
      caption: `Caption for ${id}`,
      visualPrompt: 'prompt',
      platformHints: ['tiktok'],
    },
    ingredientId: `ingredient-${id}`,
    status: 'approved',
  };
}

function makeTarget(
  credentialId: string,
  scheduledDate?: string,
): FastlaneScheduleTarget {
  return { credentialId, platform: 'tiktok', scheduledDate };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('useFastlaneSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ id: 'post-1' });
  });

  it('creates one post per asset × credential (2 × 2 = 4 posts)', async () => {
    const assets = [makeAsset('asset-1'), makeAsset('asset-2')];
    const targets = [makeTarget('cred-a'), makeTarget('cred-b')];

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    expect(mockPost).toHaveBeenCalledTimes(4);
  });

  it('uses the same groupId for all posts in the batch', async () => {
    const assets = [makeAsset('asset-1'), makeAsset('asset-2')];
    const targets = [makeTarget('cred-a'), makeTarget('cred-b')];

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    const calls = mockPost.mock.calls;
    const groupIds = calls.map((c) => (c[0] as { groupId?: string }).groupId);
    expect(new Set(groupIds).size).toBe(1);
    expect(groupIds[0]).toBe('test-group-id');
  });

  it('sets source to "fastlane" on every post', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    const payload = mockPost.mock.calls[0][0] as { source?: string };
    expect(payload.source).toBe('fastlane');
  });

  it('uses SCHEDULED status when scheduledDate is provided', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a', '2026-12-01T10:00:00Z')];

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    const payload = mockPost.mock.calls[0][0] as {
      status: string;
      scheduledDate?: string;
    };
    expect(payload.status).toBe(PostStatus.SCHEDULED);
    expect(payload.scheduledDate).toBe('2026-12-01T10:00:00Z');
  });

  it('uses SCHEDULED with an immediate scheduledDate for "post now"', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')]; // no scheduledDate → post now

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    // "Post now" must still be SCHEDULED (the publisher cron ignores PENDING for
    // Instagram/YouTube) with scheduledDate set to now so it publishes immediately.
    const payload = mockPost.mock.calls[0][0] as {
      status: string;
      scheduledDate?: string;
    };
    expect(payload.status).toBe(PostStatus.SCHEDULED);
    expect(typeof payload.scheduledDate).toBe('string');
    expect((payload.scheduledDate ?? '').length).toBeGreaterThan(0);
  });

  it('surfaces partial failures without throwing', async () => {
    const assets = [makeAsset('asset-1'), makeAsset('asset-2')];
    const targets = [makeTarget('cred-a')];

    // First succeeds, second fails
    mockPost
      .mockResolvedValueOnce({ id: 'post-1' })
      .mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    // Should surface error notification, not throw
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(result.current.isScheduling).toBe(false);
  });

  it('uses edited caption when provided', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: { 'asset-1': 'My custom caption' },
        timezone: 'UTC',
      });
    });

    const payload = mockPost.mock.calls[0][0] as { description: string };
    expect(payload.description).toBe('My custom caption');
  });

  it('sets correct category for image format', async () => {
    const assets = [makeAsset('asset-1', 'image')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule());

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    const payload = mockPost.mock.calls[0][0] as { category: string };
    expect(payload.category).toBe(PostCategory.IMAGE);
  });
});
