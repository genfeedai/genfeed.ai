import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useStudioPlaygroundProposals } from './useStudioPlaygroundProposals';

const mocks = vi.hoisted(() => ({
  responses: new Map<string, unknown>(),
}));

const getService = vi.hoisted(() => async () => ({
  propose: async (brandId: string) => mocks.responses.get(brandId),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    orgId: 'org-1',
    sessionId: 'session-1',
    userId: 'user-1',
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

function draft(id: string) {
  return { id, prompt: `Prompt ${id}`, title: `Draft ${id}` };
}

describe('useStudioPlaygroundProposals', () => {
  it('keeps the first three drafts for the surface it asked for', async () => {
    mocks.responses.set('brand-image', {
      isBrandApproved: true,
      proposals: [draft('a'), draft('b'), draft('c'), draft('d')],
      surface: 'image',
    });

    const { result } = renderHook(() =>
      useStudioPlaygroundProposals('brand-image', 'image'),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.proposals.map((proposal) => proposal.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('shows no drafts when the answer is for another surface', async () => {
    mocks.responses.set('brand-video-answer', {
      isBrandApproved: true,
      proposals: [draft('v')],
      surface: 'video',
    });

    const { result } = renderHook(() =>
      useStudioPlaygroundProposals('brand-video-answer', 'image'),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.proposals).toEqual([]);
    expect(result.current.isBrandApproved).toBe(true);
  });
});
