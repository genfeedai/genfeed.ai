import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  libraryArtifactReferences,
  loadLibraryAssets,
  resolveLibraryAssetDelivery,
} from '~services/library.service';

const auth = vi.hoisted(() => ({
  getToken: vi.fn(),
  getAuthContext: vi.fn(),
  revision: 1,
  apiEndpoint: 'https://api.genfeed.ai/v1',
}));
vi.mock('~services/environment.service', () => ({
  get apiEndpoint() {
    return auth.apiEndpoint;
  },
}));
vi.mock('~services/auth.service', () => ({ authService: auth }));
const fetchMock = vi.fn();
const asset = (
  id = 'image-1',
  brandId = 'brand-1',
  organizationId = 'org-1',
) => ({
  type: 'ingredients',
  id,
  attributes: {
    brandId,
    organizationId,
    category: 'IMAGE',
    status: 'GENERATED',
    cdnUrl: 'https://cdn.example/image.png',
    metadataLabel: 'Launch image',
    version: 2,
    isDeleted: false,
  },
});
beforeEach(() => {
  auth.revision = 1;
  auth.apiEndpoint = 'https://api.genfeed.ai/v1';
  vi.stubGlobal('fetch', fetchMock);
  auth.getToken.mockResolvedValue('token');
  auth.getAuthContext.mockResolvedValue({ organization: { id: 'org-1' } });
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [asset()],
      links: { pagination: { pages: 2 } },
    }),
  });
});
describe('extension Library', () => {
  it('loads generated media from the unified Library in the selected brand scope', async () => {
    const page = await loadLibraryAssets('brand-1', {
      page: 1,
      search: 'launch',
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v1/ingredients');
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get(
        'x-genfeed-organization-id',
      ),
    ).toBe('org-1');
    expect(url.searchParams.get('brandId')).toBe('brand-1');
    expect(url.searchParams.get('search')).toBe('launch');
    expect(url.searchParams.getAll('status')).toContain('GENERATED');
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({
      id: 'image-1',
      contentTitle: 'Launch image',
      contentType: 'Image',
      thumbnailUrl: 'https://cdn.example/image.png',
    });
    expect(libraryArtifactReferences(page.items, 'brand-1')).toEqual([
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        recordId: 'image-1',
        recordVersion: '2',
        kind: 'ingredient',
        serializer: 'ingredient',
      },
    ]);
  });
  it('uses the renewed credential after validating workspace identity', async () => {
    let credential = 'rejected-token';
    auth.getToken.mockImplementation(async () => credential);
    auth.getAuthContext.mockImplementationOnce(async () => {
      credential = 'renewed-token';
      return { organization: { id: 'org-1' } };
    });
    await loadLibraryAssets('brand-1');
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization'),
    ).toBe('Bearer renewed-token');
  });
  it('rejects missing brand before making an unscoped request', async () => {
    await expect(loadLibraryAssets('')).rejects.toThrow('Select a brand');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('excludes foreign, deleted, unfinished and unsupported records', async () => {
    const deleted = asset('deleted');
    deleted.attributes.isDeleted = true;
    const pending = asset('pending');
    pending.attributes.status = 'PENDING';
    const text = asset('text');
    text.attributes.category = 'TEXT';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          asset(),
          asset('foreign-brand', 'brand-2'),
          asset('foreign-org', 'brand-1', 'org-2'),
          deleted,
          pending,
          text,
        ],
      }),
    });
    const page = await loadLibraryAssets('brand-1');
    expect(page.items.map((item) => item.id)).toEqual(['image-1']);
    expect(libraryArtifactReferences(page.items, 'brand-2')).toEqual([]);
  });
  it('surfaces authorization and invalid API responses instead of displaying an empty Library', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Brand unavailable' }),
    });
    await expect(loadLibraryAssets('brand-1')).rejects.toThrow(
      'Brand unavailable',
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'bad envelope' }),
    });
    await expect(loadLibraryAssets('brand-1')).rejects.toThrow();
  });
});

// Unit boundary: identity/bootstrap reconciliation is covered by workspace.service.test.ts.
vi.mock('~services/workspace.service', async () => {
  const { authService } = await import('~services/auth.service');
  const { apiEndpoint } = await import('~services/environment.service');
  const snapshot = async () => {
    const context =
      'getAuthContext' in authService
        ? await authService.getAuthContext()
        : null;
    return {
      userId: context?.user?.id ?? 'user-1',
      organizationId: context?.organization?.id ?? 'org-1',
      brandId: 'brand-1',
      brands: [{ id: 'brand-1' }],
      revision: auth.revision,
    };
  };
  return {
    requireWorkspace: snapshot,
    assertWorkspace: (expected: { revision: number }) => {
      if (expected.revision !== auth.revision)
        throw new Error('Your workspace changed.');
    },
    loadWorkspace: snapshot,
    scopedWorkspaceRequest: async (
      path: string,
      options: RequestInit,
      expected: { organizationId: string },
    ) => {
      const token = await authService.getToken();
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-genfeed-organization-id', expected.organizationId);
      return fetch(path.startsWith('http') ? path : `${apiEndpoint}${path}`, {
        ...options,
        headers,
      });
    },
  };
});

it('discards a pending Library response when workspace revision changes', async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = loadLibraryAssets('brand-1');
  await vi.waitFor(() => expect(finish).toBeDefined());
  auth.revision += 1;
  finish({ ok: true, json: async () => ({ data: [asset()] }) });
  await expect(pending).rejects.toThrow('workspace changed');
});

const selectedReference = {
  kind: 'ingredient',
  serializer: 'ingredient',
  recordId: 'image-1',
  recordVersion: '2',
  brandId: 'brand-1',
  organizationId: 'org-1',
} as const;
it('encodes trimmed search exactly once and omits an empty query', async () => {
  await loadLibraryAssets('brand-1', { search: '  prompt + & detail  ' });
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('search')).toBe(
    'prompt + & detail',
  );
  await loadLibraryAssets('brand-1', { search: '  ' });
  expect(new URL(fetchMock.mock.calls[1][0]).searchParams.has('search')).toBe(
    false,
  );
});
it('resolves a current canonical batch asset and uses only its refreshed cdn URL', async () => {
  const delivery = await resolveLibraryAssetDelivery(selectedReference);
  expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(
    '/v1/ingredients/batch',
  );
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('ids')).toBe(
    'image-1',
  );
  expect(delivery).toEqual({
    reference: selectedReference,
    url: 'https://cdn.example/image.png',
  });
});
it('rejects foreign references and wrong kinds before any network request', async () => {
  for (const invalid of [
    { ...selectedReference, brandId: 'foreign' },
    { ...selectedReference, organizationId: 'foreign' },
    { ...selectedReference, recordId: '' },
    {
      ...selectedReference,
      kind: 'post' as const,
      serializer: 'post' as const,
    },
  ]) {
    await expect(resolveLibraryAssetDelivery(invalid)).rejects.toThrow(
      'current Library version',
    );
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects missing, duplicate, foreign, deleted, unsupported and changed current batch records', async () => {
  for (const data of [
    [],
    [asset(), asset()],
    [asset('wrong')],
    [asset('image-1', 'foreign')],
    [asset('image-1', 'brand-1', 'foreign')],
    [{ ...asset(), attributes: { ...asset().attributes, isDeleted: true } }],
    [{ ...asset(), attributes: { ...asset().attributes, status: 'PENDING' } }],
    [{ ...asset(), attributes: { ...asset().attributes, category: 'TEXT' } }],
    [{ ...asset(), attributes: { ...asset().attributes, version: 3 } }],
    [{ ...asset(), attributes: { ...asset().attributes, version: undefined } }],
  ]) {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data }) });
    await expect(
      resolveLibraryAssetDelivery(selectedReference),
    ).rejects.toThrow('current Library version');
  }
});
it('allows explicitly unversioned records only when both versions are absent', async () => {
  const data = [
    { ...asset(), attributes: { ...asset().attributes, version: undefined } },
  ];
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data }) });
  const { recordVersion, ...unversioned } = selectedReference;
  expect((await resolveLibraryAssetDelivery(unversioned)).reference).toEqual(
    unversioned,
  );
  await expect(resolveLibraryAssetDelivery(unversioned)).rejects.toThrow();
});
it('rejects unsafe URLs, embedded credentials, and absent CDN URL without stale fallback', async () => {
  for (const cdnUrl of [
    'http://foreign.example/image',
    'javascript:alert(1)',
    'data:image/png,a',
    'blob:https://cdn.example/a',
    'https://user:password@cdn.example/image',
    '',
  ]) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            ...asset(),
            attributes: {
              ...asset().attributes,
              cdnUrl,
              ingredientUrl: 'https://stale.example/image',
            },
          },
        ],
      }),
    });
    await expect(
      resolveLibraryAssetDelivery(selectedReference),
    ).rejects.toThrow('current Library version');
  }
});

it('permits HTTP only on the exact configured local API origin', async () => {
  auth.apiEndpoint = 'http://localhost:4000/v1';
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: [
        {
          ...asset(),
          attributes: {
            ...asset().attributes,
            cdnUrl: 'http://localhost:4000/media/image',
          },
        },
      ],
    }),
  });
  expect((await resolveLibraryAssetDelivery(selectedReference)).url).toBe(
    'http://localhost:4000/media/image',
  );
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: [
        {
          ...asset(),
          attributes: {
            ...asset().attributes,
            cdnUrl: 'http://localhost:5000/media/image',
          },
        },
      ],
    }),
  });
  await expect(
    resolveLibraryAssetDelivery(selectedReference),
  ).rejects.toThrow();
});
it('discards batch delivery after a scope change and never dispatches for a pre-aborted handoff', async () => {
  let finish!: (response: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = resolveLibraryAssetDelivery(selectedReference);
  await vi.waitFor(() => expect(finish).toBeDefined());
  auth.revision++;
  finish({ ok: true, json: async () => ({ data: [asset()] }) });
  await expect(pending).rejects.toThrow('workspace changed');
  const controller = new AbortController();
  controller.abort();
  fetchMock.mockClear();
  await expect(
    resolveLibraryAssetDelivery(selectedReference, {
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
