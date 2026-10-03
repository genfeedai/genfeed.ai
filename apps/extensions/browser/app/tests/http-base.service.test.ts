import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    userId: 'user-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    revision: 1,
  },
  request: vi.fn(),
  require: vi.fn(),
}));
vi.mock('~services/workspace.service', () => ({
  requireWorkspace: mocks.require,
  assertWorkspace: (expected: unknown) => {
    if (expected !== mocks.state) throw new Error('Your workspace changed.');
  },
  scopedWorkspaceRequest: mocks.request,
}));
vi.mock('~utils/logger.util', () => ({ logger: { error: vi.fn() } }));

import { HTTPBaseService } from '~services/http-base.service';

class Service extends HTTPBaseService {
  constructor() {
    super('https://api.genfeed.ai/v1', 'legacy');
  }
  get(path = '/brands') {
    return this.instance.get(path);
  }
}
beforeEach(() => {
  mocks.state = {
    userId: 'user-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    revision: 1,
  };
  mocks.require.mockReset().mockImplementation(async () => mocks.state);
  mocks.request.mockReset().mockResolvedValue(new Response('{"ok":true}'));
});
describe('scoped Axios adapter', () => {
  it('delegates authentication and one-refresh handling to the workspace transport', async () => {
    const service = new Service();
    expect((await service.get()).data).toEqual({ ok: true });
    expect(mocks.request).toHaveBeenCalledWith(
      'https://api.genfeed.ai/v1/brands',
      expect.objectContaining({ method: 'GET' }),
      mocks.state,
    );
  });
  it('binds a service instance to its original scope and rejects reuse after a switch', async () => {
    const service = new Service();
    await service.get();
    mocks.state = { ...mocks.state, organizationId: 'org-2', revision: 2 };
    await expect(service.get()).rejects.toThrow('workspace changed');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('enforces the request timeout in the custom adapter', async () => {
    mocks.request.mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = options.signal as AbortSignal;
          if (signal.aborted) return reject(signal.reason);
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => AbortSignal.abort(new Error('timed out')));
    await expect(new Service().get()).rejects.toThrow('Request timed out');
    expect(timeout).toHaveBeenCalledWith(30_000);
    timeout.mockRestore();
  });
  it('passes 403 through without retrying or selecting another workspace', async () => {
    mocks.request.mockResolvedValue(
      new Response('{"message":"Forbidden"}', { status: 403 }),
    );
    await expect(new Service().get()).rejects.toThrow('Forbidden');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
