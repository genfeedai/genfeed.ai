import type {
  FastlaneAssetItem,
  FastlaneScheduleTarget,
} from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockPublishTargetNow = vi.fn();
const mockScheduleTarget = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('stub-token'),
}));

vi.mock('@services/content/release-groups.service', () => ({
  ReleaseGroupsService: {
    getInstance: () => ({
      create: mockCreate,
      publishTargetNow: mockPublishTargetNow,
      scheduleTarget: mockScheduleTarget,
    }),
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
    mockCreate.mockImplementation(
      async (input: { targets: Array<{ credentialId: string }> }) => ({
        id: 'release-1',
        targets: input.targets.map((target, index) => ({
          id: `target-${index + 1}`,
          credentialId: target.credentialId,
        })),
      }),
    );
    mockPublishTargetNow.mockResolvedValue({ id: 'release-1' });
    mockScheduleTarget.mockResolvedValue({ id: 'release-1' });
  });

  it('creates one release per asset, not one post per credential', async () => {
    const assets = [makeAsset('asset-1'), makeAsset('asset-2')];
    const targets = [makeTarget('cred-a'), makeTarget('cred-b')];

    const { result } = renderHook(() => useFastlaneSchedule('brand-1'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockPublishTargetNow).toHaveBeenCalledTimes(4);
    expect(mockScheduleTarget).not.toHaveBeenCalled();
  });

  it('publishes immediately when no scheduledDate is set', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule('brand-1'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    expect(mockPublishTargetNow).toHaveBeenCalledWith('release-1', 'target-1');
    expect(mockScheduleTarget).not.toHaveBeenCalled();
  });

  it('schedules through the release target path when a date is set', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a', '2026-12-01T10:00:00Z')];

    const { result } = renderHook(() => useFastlaneSchedule('brand-1'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    expect(mockScheduleTarget).toHaveBeenCalledWith(
      'release-1',
      'target-1',
      '2026-12-01T10:00:00Z',
    );
    expect(mockPublishTargetNow).not.toHaveBeenCalled();
  });

  it('surfaces partial failures without throwing', async () => {
    const assets = [makeAsset('asset-1'), makeAsset('asset-2')];
    const targets = [makeTarget('cred-a')];

    mockCreate
      .mockResolvedValueOnce({
        id: 'release-1',
        targets: [{ id: 'target-1', credentialId: 'cred-a' }],
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFastlaneSchedule('brand-1'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    expect(mockError).toHaveBeenCalledTimes(1);
    expect(result.current.isScheduling).toBe(false);
  });

  it('uses edited caption when provided', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule('brand-1'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: { 'asset-1': 'My custom caption' },
        timezone: 'UTC',
      });
    });

    const payload = mockCreate.mock.calls[0][0] as { baseContent: string };
    expect(payload.baseContent).toBe('My custom caption');
  });

  it('passes brandId into the release create payload', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule('brand-9'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        timezone: 'UTC',
      });
    });

    const payload = mockCreate.mock.calls[0][0] as { brandId?: string };
    expect(payload.brandId).toBe('brand-9');
  });

  it('passes postingSetId into the release create payload', async () => {
    const assets = [makeAsset('asset-1')];
    const targets = [makeTarget('cred-a')];

    const { result } = renderHook(() => useFastlaneSchedule('brand-1'));

    await act(async () => {
      await result.current.scheduleApproved({
        assets,
        targets,
        captions: {},
        postingSetId: 'set-1',
        timezone: 'UTC',
      });
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        postingSetId: 'set-1',
      }),
    );
  });
});
