import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handoff: vi.fn(),
  load: vi.fn(),
  resolve: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock('~services/library.service', () => ({
  loadLibraryAssets: mocks.load,
  resolveLibraryAssetDelivery: mocks.resolve,
}));
vi.mock('~services/library-handoff.service', () => ({
  handoffLibraryAsset: mocks.handoff,
}));
vi.mock('~services/workspace.service', () => ({
  requireWorkspace: mocks.workspace,
}));
vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn() },
}));

import { handlePageLibraryMessage } from '~services/page-library-message';

const REFERENCE = {
  brandId: 'brand-1',
  kind: 'ingredient',
  organizationId: 'org-1',
  recordId: 'asset-1',
  serializer: 'ingredient',
};

function asset(id: string, kind: string, thumbnailUrl?: string) {
  return {
    brandId: 'brand-1',
    contentTitle: `Asset ${id}`,
    contentType: kind,
    id,
    kind,
    reference: { ...REFERENCE, recordId: id },
    thumbnailUrl,
  };
}

function call(
  request: Record<string, unknown>,
  fetchDataUrl = vi.fn(async () => 'data:image/png;base64,AA=='),
): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    handlePageLibraryMessage(
      request,
      (response) => resolve(response ?? {}),
      fetchDataUrl,
    ),
  );
}

describe('handlePageLibraryMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue({ brandId: 'brand-1' });
  });

  it('lists only images and videos of the active brand, with data-URL previews', async () => {
    mocks.load.mockResolvedValue({
      hasMore: false,
      items: [
        asset('a', 'image', 'https://cdn.genfeed.ai/a.png'),
        asset('b', 'audio'),
        asset('c', 'video'),
      ],
    });

    const response = await call({ event: 'pageLibraryList' });

    expect(mocks.load).toHaveBeenCalledWith('brand-1');
    expect(response).toEqual({
      items: [
        {
          id: 'a',
          kind: 'image',
          reference: { ...REFERENCE, recordId: 'a' },
          thumbnail: 'data:image/png;base64,AA==',
          title: 'Asset a',
        },
        {
          id: 'c',
          kind: 'video',
          reference: { ...REFERENCE, recordId: 'c' },
          thumbnail: undefined,
          title: 'Asset c',
        },
      ],
      success: true,
    });
  });

  it('asks for a brand when none is selected', async () => {
    mocks.workspace.mockResolvedValue({ brandId: undefined });

    expect(await call({ event: 'pageLibraryList' })).toEqual({
      error: 'Select a brand in Genfeed to use its Library.',
      success: false,
    });
  });

  it('hands the checked asset over as a file named for its type', async () => {
    mocks.resolve.mockResolvedValue({
      reference: REFERENCE,
      url: 'https://cdn.genfeed.ai/asset-1.mp4',
    });

    const response = await call(
      { event: 'pageLibraryFile', reference: REFERENCE },
      vi.fn(async () => 'data:video/mp4;base64,AA=='),
    );

    expect(mocks.resolve).toHaveBeenCalledWith(REFERENCE);
    expect(response).toEqual({
      dataUrl: 'data:video/mp4;base64,AA==',
      filename: 'genfeed-library.mp4',
      success: true,
    });
  });

  it('refuses a request without a usable asset reference', async () => {
    expect(
      await call({ event: 'pageLibraryFile', reference: { recordId: 1 } }),
    ).toEqual({
      error: 'This asset is unavailable. Pick it again.',
      success: false,
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('opens the asset in a tab', async () => {
    mocks.handoff.mockResolvedValue({ kind: 'asset-opened' });

    expect(
      await call({ event: 'pageLibraryOpen', reference: REFERENCE }),
    ).toEqual({ success: true });
    expect(mocks.handoff).toHaveBeenCalledWith(REFERENCE, 'open');
  });
});
