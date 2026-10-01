import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryboardCapabilities } from './use-storyboard-capabilities';

const mocks = vi.hoisted(() => ({ get: vi.fn(), brand: 'brand' }));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brand,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const service = async () => ({ getStoryboardRunCapabilities: mocks.get });
  return { useAuthedService: () => service };
});
const response = (revision: number) => ({
  runId: 'run',
  runRevision: revision,
  status: 'unavailable',
  reasonCode: 'NO_ELIGIBLE_VIDEO_MODEL',
  eligibleModels: [],
  effectiveModel: null,
});
describe('revision-scoped video model metadata', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.brand = 'brand';
  });
  it('hides old metadata immediately and ignores a late response after a revision changes', async () => {
    let resolveOld: ((value: ReturnType<typeof response>) => void) | undefined;
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(response(2));
    const { result, rerender } = renderHook(
      ({ revision }) => useStoryboardCapabilities('run', revision),
      { initialProps: { revision: 1 } },
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
    const signal = mocks.get.mock.calls[0][2];
    rerender({ revision: 2 });
    expect(result.current.capabilities).toBeUndefined();
    await waitFor(() =>
      expect(result.current.capabilities?.runRevision).toBe(2),
    );
    await act(async () => resolveOld?.(response(1)));
    expect(signal.aborted).toBe(true);
    expect(result.current.capabilities?.runRevision).toBe(2);
  });
  it('rejects metadata belonging to a different saved revision and permits explicit retry', async () => {
    mocks.get
      .mockResolvedValueOnce(response(2))
      .mockResolvedValueOnce(response(1));
    const { result } = renderHook(() => useStoryboardCapabilities('run', 1));
    await waitFor(() =>
      expect(result.current.capabilityError).toContain('changed'),
    );
    expect(result.current.capabilities).toBeUndefined();
    act(() => result.current.refreshCapabilities());
    await waitFor(() =>
      expect(result.current.capabilities?.runRevision).toBe(1),
    );
  });
});
