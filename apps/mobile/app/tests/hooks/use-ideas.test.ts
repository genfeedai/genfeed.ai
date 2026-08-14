import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/auth-context', () => ({
  useMobileAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoaded: true,
    isSignedIn: true,
    refreshSession: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    user: null,
  })),
}));

vi.mock('@/services/api/ideas.service', () => ({
  ideasService: {
    create: vi.fn(),
    delete: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  },
}));

import { useMobileAuth } from '@/contexts/auth-context';
import { useIdea, useIdeaActions, useIdeas } from '@/hooks/use-ideas';
import { ideasService } from '@/services/api/ideas.service';

describe('useIdeas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('loads the ideas list through the service', async () => {
    vi.mocked(ideasService.findAll).mockResolvedValue({
      data: [{ id: 'idea-1', type: 'idea', attributes: { text: 'Ship' } }],
    } as never);

    const { result } = renderHook(() => useIdeas({ page: 1 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ideas).toEqual([
      { attributes: { text: 'Ship' }, id: 'idea-1', type: 'idea' },
    ]);
    expect(ideasService.findAll).toHaveBeenCalledWith('test-token', {
      page: 1,
    });
  });
});

describe('useIdea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('loads one idea by id', async () => {
    vi.mocked(ideasService.findOne).mockResolvedValue({
      data: { id: 'idea-1', type: 'idea', attributes: { text: 'Ship' } },
    } as never);

    const { result } = renderHook(() => useIdea('idea-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.idea?.id).toBe('idea-1');
  });
});

describe('useIdeaActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('creates, updates, and removes ideas', async () => {
    vi.mocked(ideasService.create).mockResolvedValue({
      data: { id: 'idea-1', type: 'idea', attributes: { text: 'Ship' } },
    } as never);
    vi.mocked(ideasService.update).mockResolvedValue({
      data: { id: 'idea-1', type: 'idea', attributes: { text: 'Shipped' } },
    } as never);
    vi.mocked(ideasService.delete).mockResolvedValue(undefined);

    const { result } = renderHook(() => useIdeaActions());

    await act(async () => {
      await expect(
        result.current.create({ text: 'Ship' }),
      ).resolves.toMatchObject({ id: 'idea-1' });
      await expect(
        result.current.update('idea-1', { text: 'Shipped' }),
      ).resolves.toMatchObject({ id: 'idea-1' });
      await expect(result.current.remove('idea-1')).resolves.toBe(true);
    });
  });
});
