import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadLibraryAssets,
  libraryArtifactReferences,
} from '~services/library.service';
const auth = vi.hoisted(() => ({ getToken: vi.fn(), getAuthContext: vi.fn() }));
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
