import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  identity: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@plasmohq/storage', () => ({
  Storage: class {
    get = async (key: string) => mocks.store.get(key);
    set = async (key: string, value: unknown) => {
      mocks.store.set(key, value);
    };
    remove = async (key: string) => {
      mocks.store.delete(key);
    };
  },
}));
vi.mock('~services/auth.service', () => ({
  authService: {
    invalidateAuthContext: vi.fn(),
    getAuthContext: mocks.identity,
    refreshSessionToken: mocks.refresh,
    makeAuthenticatedRequest: mocks.request,
  },
}));
const identity = (
  organization = 'org-1',
  user = 'user-1',
  isApiKey = false,
) => ({ user: { id: user }, organization: { id: organization }, isApiKey });
const brand = (id = 'brand-1', organizationId = 'org-1') => ({
  id,
  label: id,
  organizationId,
  isDeleted: false,
});
const organizations = (active = 'org-1') =>
  ['org-1', 'org-2'].map((id) => ({
    id,
    label: 'Same name',
    slug: id,
    isActive: id === active,
  }));
const bootstrap = (
  organizationId = 'org-1',
  userId = 'user-1',
  brands = [brand()],
  brandId = 'brand-1',
) => ({ access: { organizationId, userId, brandId }, brands });
let service: typeof import('~services/workspace.service');
let currentBootstrap = bootstrap();
let currentOrganizations = organizations();
beforeEach(async () => {
  vi.resetModules();
  mocks.store.clear();
  mocks.identity.mockReset().mockResolvedValue(identity());
  mocks.refresh.mockReset().mockResolvedValue('renewed');
  currentBootstrap = bootstrap();
  currentOrganizations = organizations();
  mocks.request
    .mockReset()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/auth/bootstrap')
              ? currentBootstrap
              : url.includes('/organizations?')
                ? currentOrganizations
                : {},
          ),
          { status: 200 },
        ),
    );
  service = await import('~services/workspace.service');
});
describe('verified extension workspace', () => {
  it('follows canonical web bootstrap rather than a cached tenant', async () => {
    mocks.store.set('extension_workspace:user-2:org-2', 'foreign');
    expect(await service.loadWorkspace({})).toMatchObject({
      userId: 'user-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
      organizations: currentOrganizations,
    });
  });
  it('parses a plain bootstrap and rejects JSON API shaped or malformed responses', async () => {
    currentBootstrap = { data: bootstrap() } as never;
    await expect(service.loadWorkspace({})).rejects.toThrow('incomplete');
    expect(service.getWorkspaceState().status).toBe('blocked');
  });
  it('rejects disagreement between identity and bootstrap', async () => {
    currentBootstrap = bootstrap('org-2');
    await expect(service.loadWorkspace({})).rejects.toThrow('not confirmed');
  });
  it('filters foreign and deleted brands and discards an inaccessible persisted selection', async () => {
    currentBootstrap = bootstrap('org-1', 'user-1', [
      brand(),
      brand('foreign', 'org-2'),
      { ...brand('deleted'), isDeleted: true },
    ]);
    mocks.store.set('extension_workspace:user-1:org-1', 'foreign');
    const result = await service.loadWorkspace({});
    expect(result.brands.map((item) => item.id)).toEqual(['brand-1']);
    expect(mocks.store.get('extension_workspace:user-1:org-1')).toBe('brand-1');
  });
  it('keeps ambiguous and empty brand selections null', async () => {
    currentBootstrap = bootstrap(
      'org-1',
      'user-1',
      [brand('one'), brand('two')],
      'unavailable',
    );
    expect((await service.loadWorkspace({})).brandId).toBeNull();
    currentBootstrap = bootstrap('org-1', 'user-1', [], '');
    expect((await service.loadWorkspace({})).brandId).toBeNull();
  });
  it('retains current accessible selection before persisted/bootstrap preferences', async () => {
    currentBootstrap = bootstrap('org-1', 'user-1', [brand(), brand('two')]);
    await service.loadWorkspace({});
    await service.selectWorkspaceBrand('two');
    mocks.store.set('extension_workspace:user-1:org-1', 'brand-1');
    expect((await service.loadWorkspace({ forceRefresh: true })).brandId).toBe(
      'two',
    );
  });
  it('does not invalidate same-brand selection or same-scope focus refresh', async () => {
    const first = await service.loadWorkspace({});
    expect(await service.selectWorkspaceBrand(first.brandId)).toBe(first);
    const next = await service.loadWorkspace({ forceRefresh: true });
    expect(next.revision).toBe(first.revision);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('adds the fail-closed header and rejects a late response after brand switching', async () => {
    currentBootstrap = bootstrap('org-1', 'user-1', [brand(), brand('two')]);
    const first = await service.loadWorkspace({});
    let resolve!: (response: Response) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const pending = service.scopedWorkspaceRequest('/ingredients', {}, first);
    expect(
      new Headers(mocks.request.mock.calls.at(-1)?.[1].headers).get(
        'x-genfeed-organization-id',
      ),
    ).toBe('org-1');
    await service.selectWorkspaceBrand('two');
    resolve(new Response('{}'));
    await expect(pending).rejects.toThrow('workspace changed');
  });
  it('rejects an inaccessible brand before publishing a new scope', async () => {
    const first = await service.loadWorkspace({});
    await expect(service.selectWorkspaceBrand('foreign')).rejects.toThrow(
      'not accessible',
    );
    expect(service.getWorkspaceState()).toEqual({
      status: 'ready',
      snapshot: first,
    });
  });
  it('activates unscoped, renews the cookie token and requires active confirmation', async () => {
    await service.loadWorkspace({});
    mocks.request.mockImplementation(
      async (url: string, options: RequestInit) => {
        if (url.endsWith('/activate')) {
          expect(
            new Headers(options.headers).has('x-genfeed-organization-id'),
          ).toBe(false);
          mocks.identity.mockResolvedValue(identity('org-2'));
          currentBootstrap = bootstrap(
            'org-2',
            'user-1',
            [brand('brand-2', 'org-2')],
            'brand-2',
          );
          currentOrganizations = organizations('org-2');
        }
        return new Response(
          JSON.stringify(
            url.includes('/auth/bootstrap')
              ? currentBootstrap
              : url.includes('/organizations?')
                ? currentOrganizations
                : {},
          ),
        );
      },
    );
    expect(await service.activateWorkspace('org-2')).toMatchObject({
      organizationId: 'org-2',
      brandId: 'brand-2',
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('blocks unconfirmed activation rather than restoring old ready data', async () => {
    await service.loadWorkspace({});
    await expect(service.activateWorkspace('org-2')).rejects.toThrow(
      'not confirmed',
    );
    expect(service.getWorkspaceState().status).toBe('blocked');
  });
  it('pins API keys and rejects activation without contacting the activation endpoint', async () => {
    mocks.identity.mockResolvedValue(identity('org-1', 'user-1', true));
    await service.loadWorkspace({});
    const count = mocks.request.mock.calls.length;
    await expect(service.activateWorkspace('org-2')).rejects.toThrow('pinned');
    expect(mocks.request).toHaveBeenCalledTimes(count);
  });
  it('invalidates scope on account drift and never reuses another account selection', async () => {
    const previous = await service.loadWorkspace({});
    mocks.identity.mockResolvedValue(identity('org-1', 'user-2'));
    currentBootstrap = bootstrap('org-1', 'user-2');
    const next = await service.loadWorkspace({ forceRefresh: true });
    expect(next.userId).toBe('user-2');
    expect(next.revision).toBeGreaterThan(previous.revision);
    expect(() => service.assertWorkspace(previous)).toThrow(
      'workspace changed',
    );
  });
  it('blocks confirmed cookie logout and permits retry after a server outage', async () => {
    const initial = await service.loadWorkspace({});
    mocks.refresh.mockRejectedValueOnce(new Error('HTTP 503. Retry.'));
    await expect(service.loadWorkspace({ forceRefresh: true })).rejects.toThrow(
      '503',
    );
    expect(service.getWorkspaceState().status).toBe('blocked');
    expect((await service.loadWorkspace({ forceRefresh: true })).revision).toBe(
      initial.revision,
    );
    mocks.refresh.mockResolvedValueOnce(null);
    await expect(service.loadWorkspace({ forceRefresh: true })).rejects.toThrow(
      'expired',
    );
    expect(() => service.assertWorkspace(initial)).toThrow('workspace changed');
  });
});

it('applies an intentional stored brand from another surface only after verified reload', async () => {
  currentBootstrap = bootstrap('org-1', 'user-1', [brand(), brand('two')]);
  const first = await service.loadWorkspace({});
  mocks.store.set('extension_workspace:user-1:org-1', 'two');
  expect((await service.loadWorkspace({ forceRefresh: true })).brandId).toBe(
    'brand-1',
  );
  mocks.store.set('extension_workspace:user-1:org-1', 'two');
  const selected = await service.loadWorkspace({
    forceRefresh: true,
    isStoredSelectionPreferred: true,
  });
  expect(selected.brandId).toBe('two');
  expect(selected.revision).toBeGreaterThan(first.revision);
});
it('blocks new actions while verified focus refresh is pending', async () => {
  await service.loadWorkspace({});
  let release!: (token: string) => void;
  mocks.refresh.mockImplementationOnce(
    () =>
      new Promise<string>((done) => {
        release = done;
      }),
  );
  const revalidation = service.loadWorkspace({ forceRefresh: true });
  await vi.waitFor(() =>
    expect(service.getWorkspaceState().status).toBe('refreshing'),
  );
  await expect(service.requireWorkspace()).rejects.toThrow('being verified');
  release('renewed');
  await revalidation;
});

it('fences the exact-token account identity before the authenticated transport can send', async () => {
  const expected = await service.loadWorkspace({});
  mocks.request.mockImplementationOnce(
    async (
      _url: string,
      _options: RequestInit,
      guard: (context: ReturnType<typeof identity>) => void,
    ) => {
      guard(identity('org-1', 'other-user'));
      return new Response('{}');
    },
  );
  await expect(
    service.scopedWorkspaceRequest('/posts', { method: 'POST' }, expected),
  ).rejects.toThrow('account or workspace changed');
});
it('rechecks revision at the authenticated replay fence and rejects foreign API origins', async () => {
  currentBootstrap = bootstrap('org-1', 'user-1', [brand(), brand('two')]);
  const expected = await service.loadWorkspace({});
  mocks.request.mockImplementationOnce(
    async (
      _url: string,
      _options: RequestInit,
      guard: (context: ReturnType<typeof identity>) => void,
    ) => {
      await service.selectWorkspaceBrand('two');
      guard(identity());
      return new Response('{}');
    },
  );
  await expect(
    service.scopedWorkspaceRequest('/posts', { method: 'POST' }, expected),
  ).rejects.toThrow('workspace changed');
  const current = await service.requireWorkspace();
  await expect(
    service.scopedWorkspaceRequest(
      'https://untrusted.example/posts',
      {},
      current,
    ),
  ).rejects.toThrow('Genfeed API');
});
