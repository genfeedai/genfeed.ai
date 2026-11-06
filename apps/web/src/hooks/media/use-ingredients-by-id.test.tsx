// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useIngredientsById } from './use-ingredients-by-id';

const mocks = vi.hoisted(() => ({
  findByIds: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  // The real hook returns a stable getter; a new one per render would loop.
  const getService = async () => ({ findByIds: mocks.findByIds });
  return { useAuthedService: () => getService };
});

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('useIngredientsById', () => {
  beforeEach(() => {
    mocks.findByIds.mockReset();
  });

  it('reads each distinct id once and indexes the result by id', async () => {
    mocks.findByIds.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const { result } = renderHook(() => useIngredientsById(['b', 'a', 'a']));

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(mocks.findByIds).toHaveBeenCalledTimes(1);
    expect(mocks.findByIds).toHaveBeenCalledWith(['a', 'b']);
    expect(result.current.get('a')).toEqual({ id: 'a' });
  });

  it('does not read anything for an empty list', () => {
    const { result } = renderHook(() => useIngredientsById([]));

    expect(result.current.size).toBe(0);
    expect(mocks.findByIds).not.toHaveBeenCalled();
  });
});
