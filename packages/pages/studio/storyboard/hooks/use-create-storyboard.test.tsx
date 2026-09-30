import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateStoryboard } from './use-create-storyboard';

const mocks = vi.hoisted(() => ({ brandId: 'brand-one', create: vi.fn() }));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ createStoryboardRun: mocks.create }),
}));
const input = { source: { kind: 'brief' as const, brief: 'A saved idea' } };
describe('unpaid storyboard creation', () => {
  beforeEach(() => {
    mocks.brandId = 'brand-one';
    mocks.create.mockReset();
  });
  it('reuses its UUID on transport retry and retains the source', async () => {
    mocks.create
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ id: 'run', brandId: 'brand-one' });
    const { result } = renderHook(() => useCreateStoryboard());
    await act(async () => {
      await expect(result.current.create(input)).rejects.toThrow('Offline');
    });
    expect(result.current.error).toBeTruthy();
    await act(async () => {
      expect(await result.current.create(input)).toBe('run');
    });
    const first = mocks.create.mock.calls[0][1];
    expect(first.clientRequestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(mocks.create.mock.calls[1][1]).toEqual(first);
    expect(first.source).toEqual(input.source);
  });
  it('deduplicates simultaneous submits', async () => {
    mocks.create.mockResolvedValue({ id: 'run', brandId: 'brand-one' });
    const { result } = renderHook(() => useCreateStoryboard());
    await act(async () => {
      expect(
        await Promise.all([
          result.current.create(input),
          result.current.create(input),
        ]),
      ).toEqual(['run', 'run']);
    });
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('does not return a run after the active brand changes', async () => {
    let resolve: ((run: { id: string; brandId: string }) => void) | undefined;
    mocks.create.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result, rerender } = renderHook(() => useCreateStoryboard());
    let task: Promise<string>;
    await act(async () => {
      task = result.current.create(input);
      await Promise.resolve();
    });
    mocks.brandId = 'brand-two';
    rerender();
    await act(async () => {
      resolve?.({ id: 'run', brandId: 'brand-one' });
      await expect(task).rejects.toThrow('brand changed');
    });
    expect(result.current.error).toBeNull();
  });
});
