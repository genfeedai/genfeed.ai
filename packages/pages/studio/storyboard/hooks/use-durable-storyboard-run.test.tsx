import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableStoryboardRun } from './use-durable-storyboard-run';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-one',
  get: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    userId: 'user',
    orgId: 'org',
    sessionId: 'session',
  }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'org' }),
}));
vi.mock('@genfeedai/auth-client', () => ({
  getSession: vi.fn(async () => ({
    data: { user: { id: 'user' }, session: { activeOrganizationId: 'org' } },
  })),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const getService = async () => ({
    getStoryboardRun: mocks.get,
    updateStoryboardPlan: mocks.update,
  });
  return { useAuthedService: () => getService };
});
describe('brand-scoped durable storyboard loading', () => {
  beforeEach(() => {
    mocks.brandId = 'brand-one';
    mocks.get.mockReset();
  });
  it('passes brand, run and cancellation signal and hides an old-brand response', async () => {
    let resolveOld:
      | ((run: { id: string; brandId: string }) => void)
      | undefined;
    mocks.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ id: 'run', brandId: 'brand-two' });
    const { result, rerender } = renderHook(() =>
      useDurableStoryboardRun('run'),
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
    expect(mocks.get.mock.calls[0].slice(0, 2)).toEqual(['brand-one', 'run']);
    const oldSignal = mocks.get.mock.calls[0][2];
    mocks.brandId = 'brand-two';
    rerender();
    await waitFor(() => expect(result.current.run?.brandId).toBe('brand-two'));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      resolveOld?.({ id: 'run', brandId: 'brand-one' });
    });
    expect(result.current.run?.brandId).toBe('brand-two');
  });
  it('rejects a response from another brand instead of rendering it', async () => {
    mocks.get.mockResolvedValue({ id: 'run', brandId: 'brand-other' });
    const { result } = renderHook(() => useDurableStoryboardRun('run'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.run).toBeNull();
  });
});
