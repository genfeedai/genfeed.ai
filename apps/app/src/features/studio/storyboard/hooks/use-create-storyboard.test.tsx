import { EnvironmentService } from '@services/core/environment.service';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateStoryboard } from './use-create-storyboard';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-one',
  organizationId: 'org-one',
  userId: 'user-one',
  sessionId: 'session-one',
  create: vi.fn(),
  failService: false,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mocks.brandId,
    organizationId: mocks.organizationId,
  }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: mocks.userId, sessionId: mocks.sessionId }),
}));
vi.mock('@genfeedai/auth-client', () => ({
  getSession: vi.fn(async () => ({
    data: {
      user: { id: mocks.userId },
      session: { activeOrganizationId: mocks.organizationId },
    },
  })),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => {
    if (mocks.failService) throw new Error('Token unavailable');
    return { createStoryboardRun: mocks.create };
  },
}));
const input = { source: { kind: 'brief' as const, brief: 'A saved idea' } };
describe('unpaid storyboard creation', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    mocks.brandId = 'brand-one';
    mocks.organizationId = 'org-one';
    mocks.userId = 'user-one';
    mocks.sessionId = 'session-one';
    mocks.create.mockReset();
    mocks.failService = false;
  });
  it('reuses its UUID on transport retry and retains the source', async () => {
    mocks.create
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({
        id: 'run',
        brandId: 'brand-one',
        organizationId: 'org-one',
      });
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
  it('does not retire an uncertain UUID when a later retry fails before dispatch', async () => {
    mocks.create
      .mockRejectedValueOnce(new Error('Lost response'))
      .mockResolvedValueOnce({
        id: 'run',
        brandId: 'brand-one',
        organizationId: 'org-one',
      });
    const { result } = renderHook(() => useCreateStoryboard());
    await act(async () => {
      await expect(result.current.create(input)).rejects.toThrow(
        'Lost response',
      );
    });
    const id = mocks.create.mock.calls[0][1].clientRequestId;
    mocks.failService = true;
    await act(async () => {
      await expect(result.current.create(input)).rejects.toThrow(
        'Token unavailable',
      );
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    mocks.failService = false;
    await act(async () => {
      await result.current.create(input);
    });
    expect(mocks.create.mock.calls[1][1].clientRequestId).toBe(id);
  });
  it('keeps an older in-flight replay identity when a remounted retry fails before dispatch and the older response settles', async () => {
    let finish: (run: object) => void = () => undefined;
    mocks.create
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({
        id: 'run',
        brandId: 'brand-one',
        organizationId: 'org-one',
      });
    const first = renderHook(() => useCreateStoryboard());
    let pending: Promise<string> = Promise.resolve('');
    await act(async () => {
      pending = first.result.current.create(input);
      await Promise.resolve();
    });
    const outcome = pending.catch((error: Error) => error.message);
    const id = mocks.create.mock.calls[0][1].clientRequestId;
    first.unmount();
    mocks.failService = true;
    const next = renderHook(() => useCreateStoryboard());
    await act(async () => {
      await expect(next.result.current.create(input)).rejects.toThrow(
        'Token unavailable',
      );
    });
    await act(async () => {
      finish({ id: 'run', brandId: 'brand-one', organizationId: 'org-one' });
      expect(await outcome).toMatch(/changed/);
    });
    mocks.failService = false;
    await act(async () => {
      expect(await next.result.current.create(input)).toBe('run');
    });
    expect(mocks.create.mock.calls[1][1].clientRequestId).toBe(id);
  });
  it('deduplicates simultaneous submits', async () => {
    mocks.create.mockResolvedValue({
      id: 'run',
      brandId: 'brand-one',
      organizationId: 'org-one',
    });
    const { result } = renderHook(() => useCreateStoryboard());
    await act(async () => {
      const first = result.current.create(input);
      const second = result.current.create(input);
      expect(first).toBe(second);
      expect(await Promise.all([first, second])).toEqual(['run', 'run']);
    });
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('does not return a run after the active brand changes', async () => {
    let resolve:
      | ((run: { id: string; brandId: string; organizationId: string }) => void)
      | undefined;
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
      resolve?.({ id: 'run', brandId: 'brand-one', organizationId: 'org-one' });
      await expect(task).rejects.toThrow('scope changed');
    });
    expect(result.current.error).toBeNull();
  });
  it('retires a successful UUID so an identical later action creates a new draft', async () => {
    mocks.create.mockResolvedValue({
      id: 'run',
      brandId: 'brand-one',
      organizationId: 'org-one',
    });
    const { result } = renderHook(() => useCreateStoryboard());
    await act(async () => {
      await result.current.create(input);
      await result.current.create(input);
    });
    expect(mocks.create.mock.calls[0][1].clientRequestId).not.toBe(
      mocks.create.mock.calls[1][1].clientRequestId,
    );
  });
  it.each([400, 401, 403, 404, 409, 410, 422])(
    'retires definitive rejected identity (%s)',
    async (status) => {
      mocks.create
        .mockRejectedValueOnce({
          response: {
            status,
            data: { errors: [{ status: String(status), title: 'Rejected' }] },
          },
        })
        .mockResolvedValueOnce({
          id: 'run',
          brandId: 'brand-one',
          organizationId: 'org-one',
        });
      const { result } = renderHook(() => useCreateStoryboard());
      await act(async () => {
        await expect(result.current.create(input)).rejects.toBeTruthy();
        await result.current.create(input);
      });
      expect(mocks.create.mock.calls[0][1].clientRequestId).not.toBe(
        mocks.create.mock.calls[1][1].clientRequestId,
      );
    },
  );
  it.each([408, 429, 500])(
    'preserves uncertain replay identity (%s)',
    async (status) => {
      mocks.create
        .mockRejectedValueOnce({
          response: {
            status,
            data: { errors: [{ status: String(status), title: 'Retry' }] },
          },
        })
        .mockResolvedValueOnce({
          id: 'run',
          brandId: 'brand-one',
          organizationId: 'org-one',
        });
      const { result } = renderHook(() => useCreateStoryboard());
      await act(async () => {
        await expect(result.current.create(input)).rejects.toBeTruthy();
        await result.current.create(input);
      });
      expect(mocks.create.mock.calls[0][1].clientRequestId).toBe(
        mocks.create.mock.calls[1][1].clientRequestId,
      );
    },
  );
  it('invalidates an A→B→A response and its navigation permission', async () => {
    let finish: (run: object) => void = () => undefined;
    mocks.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(() => useCreateStoryboard());
    let pending: Promise<string> = Promise.resolve('');
    await act(async () => {
      pending = result.current.create(input);
      await Promise.resolve();
    });
    const outcome = pending.catch((error: Error) => error.message);
    mocks.brandId = 'brand-two';
    rerender();
    mocks.brandId = 'brand-one';
    rerender();
    await act(async () => {
      finish({ id: 'run', brandId: 'brand-one', organizationId: 'org-one' });
      expect(await outcome).toMatch(/changed/);
    });
    expect(result.current.isCurrentResult('run')).toBe(false);
  });
  it.each(['organization', 'user', 'server'] as const)(
    'does not share an in-flight creation UUID or navigation result across a %s switch',
    async (changed) => {
      let finish: (run: object) => void = () => undefined;
      mocks.create.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const { result, rerender } = renderHook(() => useCreateStoryboard());
      let first: Promise<string> = Promise.resolve('');
      await act(async () => {
        first = result.current.create(input);
        await Promise.resolve();
      });
      const outcome = first.catch((error: Error) => error.message);
      if (changed === 'organization') mocks.organizationId = 'org-two';
      if (changed === 'user') mocks.userId = 'user-two';
      if (changed === 'server')
        vi.spyOn(EnvironmentService, 'apiEndpoint', 'get').mockReturnValue(
          'http://second-api.test/v1',
        );
      rerender();
      mocks.create.mockResolvedValueOnce({
        id: 'new-scope-run',
        brandId: 'brand-one',
        organizationId: mocks.organizationId,
      });
      await act(async () => {
        expect(await result.current.create(input)).toBe('new-scope-run');
      });
      expect(mocks.create.mock.calls[0][1].clientRequestId).not.toBe(
        mocks.create.mock.calls[1][1].clientRequestId,
      );
      await act(async () => {
        finish({
          id: 'old-run',
          brandId: 'brand-one',
          organizationId: 'org-one',
        });
        expect(await outcome).toMatch(/changed/);
      });
      expect(result.current.isCurrentResult('old-run')).toBe(false);
      expect(result.current.isCurrentResult('new-scope-run')).toBe(true);
    },
  );
  it('does not share a pending request with a changed input', async () => {
    let finish: (run: object) => void = () => undefined;
    mocks.create
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({
        id: 'new-run',
        brandId: 'brand-one',
        organizationId: 'org-one',
      });
    const { result } = renderHook(() => useCreateStoryboard());
    let pending: Promise<string> = Promise.resolve('');
    await act(async () => {
      pending = result.current.create(input);
      await Promise.resolve();
    });
    const outcome = pending.catch((error: Error) => error.message);
    await act(async () => {
      expect(
        await result.current.create({
          source: { kind: 'brief', brief: 'Different idea' },
        }),
      ).toBe('new-run');
    });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish({
        id: 'old-run',
        brandId: 'brand-one',
        organizationId: 'org-one',
      });
      expect(await outcome).toMatch(/changed/);
    });
    expect(result.current.isCurrentResult('new-run')).toBe(true);
  });
});
