import { beforeEach, expect, it, vi } from 'vitest';
import { resolveLibraryAssetDelivery } from '~services/library.service';
import { handoffLibraryAsset } from '~services/library-handoff.service';

const state = vi.hoisted(() => ({ revision: 1 }));
vi.mock('~services/workspace.service', () => ({
  requireWorkspace: async () => ({ revision: state.revision }),
  assertWorkspace: (expected: { revision: number }) => {
    if (expected.revision !== state.revision)
      throw new Error('Workspace changed');
  },
}));
vi.mock('~services/library.service', () => ({
  resolveLibraryAssetDelivery: vi.fn(),
}));
const reference = {
  kind: 'ingredient',
  serializer: 'ingredient',
  recordId: 'asset',
  organizationId: 'org',
  brandId: 'brand',
} as const;
const download = vi.fn();
const open = vi.fn();
beforeEach(() => {
  state.revision = 1;
  download.mockReset().mockResolvedValue(7);
  open.mockReset().mockResolvedValue({});
  Object.assign(chrome, { downloads: { download }, tabs: { create: open } });
  vi.mocked(resolveLibraryAssetDelivery).mockReset().mockResolvedValue({
    reference,
    url: 'https://cdn.example/signed?secret=one',
  });
});
it('downloads through Chrome without media fetch, headers or automatic open and reports started only', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(await handoffLibraryAsset(reference, 'download')).toEqual({
    kind: 'download-started',
    downloadId: 7,
  });
  expect(download).toHaveBeenCalledWith({
    url: 'https://cdn.example/signed?secret=one',
    saveAs: true,
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
it('re-resolves every explicit handoff and separately opens the current URL', async () => {
  await handoffLibraryAsset(reference, 'download');
  vi.mocked(resolveLibraryAssetDelivery).mockResolvedValueOnce({
    reference,
    url: 'https://cdn.example/fresh',
  });
  expect(await handoffLibraryAsset(reference, 'open')).toEqual({
    kind: 'asset-opened',
  });
  expect(open).toHaveBeenCalledWith({
    url: 'https://cdn.example/fresh',
    active: true,
  });
  expect(resolveLibraryAssetDelivery).toHaveBeenCalledTimes(2);
});
it('scope change, cancellation or invalid asset produces no browser side effect', async () => {
  vi.mocked(resolveLibraryAssetDelivery).mockImplementationOnce(async () => {
    state.revision++;
    return { reference, url: 'https://cdn.example/image' };
  });
  await expect(handoffLibraryAsset(reference, 'download')).rejects.toThrow(
    'Workspace changed',
  );
  vi.mocked(resolveLibraryAssetDelivery).mockRejectedValueOnce(
    new Error('Asset unavailable'),
  );
  await expect(handoffLibraryAsset(reference, 'open')).rejects.toThrow(
    'Asset unavailable',
  );
  const controller = new AbortController();
  controller.abort();
  await expect(
    handoffLibraryAsset(reference, 'download', { signal: controller.signal }),
  ).rejects.toThrow();
  expect(download).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
it('denied, cancelled, invalid-ID and missing downloads API fail safely without opening a tab', async () => {
  download.mockRejectedValueOnce(
    new Error('secret=https://cdn.example/private'),
  );
  await expect(handoffLibraryAsset(reference, 'download')).rejects.toThrow(
    'Could not start the download',
  );
  for (const id of [-1, undefined, 1.5]) {
    download.mockResolvedValueOnce(id);
    await expect(handoffLibraryAsset(reference, 'download')).rejects.toThrow(
      'Could not start',
    );
  }
  Object.assign(chrome, { downloads: undefined, tabs: { create: open } });
  await expect(handoffLibraryAsset(reference, 'download')).rejects.toThrow(
    'Could not start',
  );
  expect(open).not.toHaveBeenCalled();
});
