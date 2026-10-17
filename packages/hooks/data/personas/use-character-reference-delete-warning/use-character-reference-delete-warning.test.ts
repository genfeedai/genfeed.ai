import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharacterReferenceDeleteWarning } from './use-character-reference-delete-warning';

const { mockFindReferenceUsage, mockLoggerWarn } = vi.hoisted(() => ({
  mockFindReferenceUsage: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findReferenceUsage: mockFindReferenceUsage,
  }),
}));

vi.mock('@genfeedai/services/content/personas.service', () => ({
  PersonasService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { warn: mockLoggerWarn },
}));

vi.mock('@ui/characters/CharacterReferenceUsageNotice', () => ({
  default: () => null,
}));

describe('useCharacterReferenceDeleteWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a notice when a character uses the asset', async () => {
    mockFindReferenceUsage.mockResolvedValue([
      {
        characters: [{ handle: 'vincent', id: 'p1', label: 'Vincent' }],
        ingredientId: 'img-1',
      },
    ]);
    const { result } = renderHook(() => useCharacterReferenceDeleteWarning());

    let warning: unknown;
    await act(async () => {
      warning = await result.current(['img-1']);
    });

    expect(mockFindReferenceUsage).toHaveBeenCalledWith(['img-1']);
    expect(warning).toBeTruthy();
  });

  it('returns nothing when no character uses the asset', async () => {
    mockFindReferenceUsage.mockResolvedValue([
      { characters: [], ingredientId: 'img-1' },
    ]);
    const { result } = renderHook(() => useCharacterReferenceDeleteWarning());

    let warning: unknown = 'unset';
    await act(async () => {
      warning = await result.current(['img-1']);
    });

    expect(warning).toBeUndefined();
  });

  it('returns nothing when the lookup fails, so the standard confirm stays', async () => {
    mockFindReferenceUsage.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCharacterReferenceDeleteWarning());

    let warning: unknown = 'unset';
    await act(async () => {
      warning = await result.current(['img-1']);
    });

    expect(warning).toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('drops a second call while the first lookup is still running', async () => {
    let finishLookup: (value: unknown[]) => void = () => {};
    mockFindReferenceUsage.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        finishLookup = resolve;
      }),
    );
    const { result } = renderHook(() => useCharacterReferenceDeleteWarning());

    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current(['img-1']);
      second = await result.current(['img-1']);
      finishLookup([]);
      await first;
    });

    expect(second).toBeNull();
    expect(mockFindReferenceUsage).toHaveBeenCalledTimes(1);
  });

  it('skips the lookup for an empty selection', async () => {
    const { result } = renderHook(() => useCharacterReferenceDeleteWarning());

    await act(async () => {
      await result.current([]);
    });

    expect(mockFindReferenceUsage).not.toHaveBeenCalled();
  });
});
