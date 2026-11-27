import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the person saw and what was re-read, in order. */
const world = vi.hoisted(() => ({
  events: [] as string[],
  refreshTrends: undefined as unknown as () => Promise<unknown>,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    refreshTrends: () => world.refreshTrends(),
  }),
}));

vi.mock('@genfeedai/services/social/trends.service', () => ({
  TrendsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: (message: string) => world.events.push(`error: ${message}`),
      info: (message: string) => world.events.push(`info: ${message}`),
      success: (message: string) => world.events.push(`success: ${message}`),
    }),
  },
}));

vi.mock('@/features/research/scans/use-research-scans', () => ({
  useResearchScans: () => ({
    refresh: async () => {
      world.events.push('scans re-read');
    },
    statusFor: () => ({ library: 'trends', remaining: 1 }),
  }),
}));

import { useNicheScan } from './use-niche-scan';

function limitError() {
  return {
    response: {
      data: {
        errors: [
          {
            code: 'research_scan_limit_reached',
            meta: { hasPlan: false, nextAvailableAtMs: 1_800_000_000_000 },
            status: 429,
          },
        ],
      },
    },
  };
}

describe('useNicheScan', () => {
  beforeEach(() => {
    world.events = [];
  });

  async function scan() {
    const refreshDesk = async () => {
      world.events.push('desk refreshed');
    };
    const { result } = renderHook(() => useNicheScan(refreshDesk));
    await act(async () => {
      await result.current.scan();
    });
    return result.current;
  }

  it('refreshes the desk and the counts after a scan starts', async () => {
    world.refreshTrends = async () => ({ count: 3, success: true });

    const hook = await scan();

    expect(world.events).toEqual([
      'success: started',
      'desk refreshed',
      'scans re-read',
    ]);
    expect(hook.isScanning).toBe(false);
  });

  it('tells the person a refused scan is a limit, and re-reads the counts', async () => {
    world.refreshTrends = async () => {
      throw limitError();
    };

    await scan();

    expect(world.events).toEqual(['info: limitReached', 'scans re-read']);
  });

  it('reports any other failure as an error', async () => {
    world.refreshTrends = async () => {
      throw new Error('scraper down');
    };

    await scan();

    expect(world.events).toEqual(['error: scraper down', 'scans re-read']);
  });
});
