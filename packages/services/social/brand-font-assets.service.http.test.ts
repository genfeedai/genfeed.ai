import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BrandFontAssetsService } from '@services/social/brand-font-assets.service';
import { describe, expect, it } from 'vitest';

const font = {
  id: 'font',
  brandId: 'brand',
  category: 'FONT',
  mimeType: 'font/woff2',
  contentHash: `sha256:${'a'.repeat(64)}`,
  sizeBytes: 48,
  displayName: null,
  originalFileName: 'Acme.woff2',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  isDeleted: false,
};
const requestId = '1254ff7f-367d-4cda-af62-1c666a73fc8f';
describe('Dedicated font HTTP transport', () => {
  it('uploads exact FormData with stable request identity, signal and no forced Content-Type', async () => {
    const service = new BrandFontAssetsService('token');
    const http = installMockHttp(service);
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument(font, { id: font.id })),
    );
    const file = new File([new Uint8Array(48)], 'Acme.woff2', {
      type: 'font/woff2',
    });
    const signal = new AbortController().signal;
    expect(
      await service.upload(
        'brand/encoded',
        { file, requestId, displayName: ' Acme ' },
        signal,
      ),
    ).toEqual(font);
    expect(http.post).toHaveBeenCalledOnce();
    const [path, body, options] = http.post.mock.calls[0];
    expect(path).toBe('/brand%2Fencoded/font-assets');
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(['file', 'requestId', 'displayName']);
    expect(body.get('requestId')).toBe(requestId);
    expect(body.get('displayName')).toBe('Acme');
    expect(options).toEqual({ timeout: 60000, signal });
  });
  it('rejects oversize/invalid requests before transport and never retries failed upload', async () => {
    const service = new BrandFontAssetsService('token');
    const http = installMockHttp(service);
    const file = new File([new Uint8Array(4194305)], 'Acme.woff2');
    await expect(
      service.upload('brand', { file, requestId }),
    ).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
    const small = new File([new Uint8Array(48)], 'Acme.woff2');
    await expect(
      service.upload('brand', { file: small, requestId: 'bad' }),
    ).rejects.toThrow();
    http.post.mockRejectedValue(new Error('timeout'));
    await expect(
      service.upload('brand', { file: small, requestId }),
    ).rejects.toThrow('timeout');
    expect(http.post).toHaveBeenCalledOnce();
  });
  it('reads actual cursor links and validates strict response metadata', async () => {
    const service = new BrandFontAssetsService('token');
    const http = installMockHttp(service);
    const document = collectionDocument([font]);
    http.get.mockResolvedValue(
      axiosResponse({
        ...document,
        links: { cursor: { limit: 1, hasMore: true, nextCursor: 'cursor' } },
      }),
    );
    const signal = new AbortController().signal;
    expect(await service.list('brand', { limit: 1 }, signal)).toEqual({
      items: [font],
      nextCursor: 'cursor',
    });
    expect(http.get).toHaveBeenCalledWith('/brand/font-assets', {
      params: { limit: 1 },
      signal,
    });
    http.get.mockResolvedValue(
      axiosResponse({
        ...document,
        links: { cursor: { limit: 1, hasMore: false, nextCursor: 'cursor' } },
      }),
    );
    await expect(service.list('brand')).rejects.toThrow();
    http.get.mockResolvedValue(
      axiosResponse({
        ...document,
        links: { cursor: { limit: 1, hasMore: false, nextCursor: null } },
      }),
    );
    expect((await service.list('brand')).nextCursor).toBeNull();
  });
  it('rejects private server fields and sends encoded DELETE once with signal', async () => {
    const service = new BrandFontAssetsService('token');
    const http = installMockHttp(service);
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { ...font, cloudObjectKey: 'private' },
          { id: font.id },
        ),
      ),
    );
    await expect(
      service.upload('brand', {
        file: new File([new Uint8Array(48)], 'Acme.woff2'),
        requestId,
      }),
    ).rejects.toThrow();
    const signal = new AbortController().signal;
    await service.remove('brand/one', 'font/two', signal);
    expect(http.delete).toHaveBeenCalledExactlyOnceWith(
      '/brand%2Fone/font-assets/font%2Ftwo',
      { signal },
    );
  });
});
