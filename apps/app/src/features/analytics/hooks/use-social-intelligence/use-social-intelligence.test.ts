import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  reviewTheme: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(
    (factory: (token: string) => unknown) => async () => factory('token'),
  ),
}));

vi.mock('@services/social/listening-topics.service', () => ({
  ListeningTopicsService: {
    getInstance: () => ({
      getSocialIntelligenceInbox: mocks.getInbox,
      reviewTheme: mocks.reviewTheme,
    }),
  },
}));

import { useSocialIntelligence } from './use-social-intelligence';

const scope = {
  brandId: 'brand-1',
  enabled: true,
  organizationId: 'org-1',
};

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    evidence: [
      {
        contentExcerpt: 'AI agents are changing publishing',
        freshnessExpiresAt: '2026-08-27T12:00:00.000Z',
        id: 'evidence-1',
        sourcePostId: 'source-post-1',
        sourceUrl: 'https://example.com/evidence',
      },
    ],
    signals: [
      {
        analysisKey: 'analysis-1',
        excludedSourceIds: [],
        includedSourceIds: ['source-1'],
        insufficiencyReason: null,
        status: 'sufficient',
      },
    ],
    themes: [
      {
        analysisKey: 'analysis-1',
        currentWindowEnd: '2026-08-26T12:00:00.000Z',
        currentWindowStart: '2026-08-25T12:00:00.000Z',
        evidenceIds: ['evidence-1'],
        id: 'theme-1',
        label: 'AI agents',
        previousWindowEnd: '2026-08-25T12:00:00.000Z',
        previousWindowStart: '2026-08-24T12:00:00.000Z',
        reviewState: 'unreviewed',
      },
    ],
    topic: {
      brandId: 'brand-1',
      id: 'topic-1',
      label: 'Agent discourse',
      organizationId: 'org-1',
      sources: [
        {
          collectionState: 'success',
          id: 'topic-source-1',
          platform: 'x',
          sourceId: 'source-1',
        },
      ],
    },
    ...overrides,
  };
}

function statusError(
  status: number,
  message: string,
): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('useSocialIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInbox.mockResolvedValue([bundle()]);
    mocks.reviewTheme.mockResolvedValue({
      evidenceIds: ['evidence-1'],
      id: 'theme-1',
      reviewState: 'acknowledged',
    });
  });

  it('exposes loading, empty, and ready states', async () => {
    let resolveInbox: (value: unknown[]) => void = () => undefined;
    mocks.getInbox.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInbox = resolve;
      }),
    );
    const loading = renderHook(() => useSocialIntelligence(scope), {
      wrapper: createQueryWrapper(),
    });
    expect(loading.result.current.state).toBe('loading');
    await act(async () => resolveInbox([]));
    await waitFor(() => expect(loading.result.current.state).toBe('empty'));
    loading.unmount();

    mocks.getInbox.mockResolvedValueOnce([bundle()]);
    const ready = renderHook(() => useSocialIntelligence(scope), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(ready.result.current.state).toBe('ready'));
    expect(ready.result.current.items).toHaveLength(1);
  });

  it('marks missing and failed source coverage partial with an explicit reason', async () => {
    mocks.getInbox.mockResolvedValueOnce([
      bundle({
        signals: [
          {
            analysisKey: 'analysis-1',
            excludedSourceIds: ['source-2'],
            includedSourceIds: ['source-1'],
            insufficiencyReason: 'source_coverage_gap',
            status: 'insufficient_evidence',
          },
        ],
        topic: {
          brandId: 'brand-1',
          id: 'topic-1',
          label: 'Agent discourse',
          organizationId: 'org-1',
          sources: [
            {
              collectionState: 'success',
              id: 'topic-source-1',
              platform: 'x',
              sourceId: 'source-1',
            },
            {
              collectionState: 'failed',
              id: 'topic-source-2',
              lastCollectionError: 'Credential missing',
              platform: 'linkedin',
              sourceId: 'source-2',
            },
          ],
        },
      }),
    ]);

    const { result } = renderHook(() => useSocialIntelligence(scope), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.state).toBe('partial'));
    expect(result.current.partialReason).toContain('linkedin');
    expect(result.current.partialReason).toContain('Credential missing');
  });

  it.each([
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ] as const)(
    'maps HTTP %s to a recoverable %s state',
    async (status, state) => {
      mocks.getInbox.mockRejectedValueOnce(
        statusError(status, 'Request failed'),
      );
      const { result } = renderHook(() => useSocialIntelligence(scope), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => expect(result.current.state).toBe(state));
      expect(result.current.errorMessage).toBe('Request failed');

      mocks.getInbox.mockResolvedValueOnce([bundle()]);
      await act(async () => result.current.retry());
      await waitFor(() => expect(result.current.state).toBe('ready'));
    },
  );

  it('reviews a theme in scope and refreshes the durable state', async () => {
    mocks.getInbox.mockResolvedValueOnce([bundle()]).mockResolvedValueOnce([
      bundle({
        themes: [
          {
            ...bundle().themes[0],
            reviewState: 'acknowledged',
            reviewedAt: '2026-08-26T14:00:00.000Z',
            reviewedBy: 'user-1',
          },
        ],
      }),
    ]);
    const { result } = renderHook(() => useSocialIntelligence(scope), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.state).toBe('ready'));

    await act(async () =>
      result.current.reviewTheme('topic-1', 'theme-1', 'acknowledged'),
    );

    expect(mocks.reviewTheme).toHaveBeenCalledWith(
      'topic-1',
      'theme-1',
      'acknowledged',
      { brandId: 'brand-1', organizationId: 'org-1' },
    );
    await waitFor(() =>
      expect(result.current.items[0]?.themes[0]?.reviewState).toBe(
        'acknowledged',
      ),
    );
  });
});
