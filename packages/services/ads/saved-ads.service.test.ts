import { collectionDocument } from '@services/__mocks__/http.mock';
import type {
  AxiosAdapter,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { describe, expect, it } from 'vitest';
import { SavedAdsService } from './saved-ads.service';

interface SentRequest {
  body: unknown;
  method: string;
  params: unknown;
  path: string;
}

/**
 * The saved-ads API on the far side of the real axios instance: every request
 * the client sends is recorded, and `respond` answers it.
 */
function savedAdsApi(respond: (request: SentRequest) => unknown = () => ({})) {
  const service = new SavedAdsService('token');
  const sent: SentRequest[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const request = {
      body: typeof config.data === 'string' ? JSON.parse(config.data) : null,
      method: String(config.method).toUpperCase(),
      params: config.params,
      path: new URL(axiosUrl(config)).pathname,
    };
    sent.push(request);
    return {
      config,
      data: respond(request),
      headers: {},
      status: 200,
      statusText: 'OK',
    };
  };
  (
    service as unknown as { instance: AxiosInstance }
  ).instance.defaults.adapter = adapter;
  return { sent, service };
}

function axiosUrl(config: InternalAxiosRequestConfig): string {
  return `${config.baseURL ?? ''}${config.url ?? ''}`;
}

function savedAdsPage(id: string, page: number) {
  return collectionDocument([{ brandId: 'brand-1', id }], {
    pagination: { limit: 100, page, pages: 2, total: 101 },
  });
}

describe('SavedAdsService client', () => {
  it('sends every mutation to /saved-ads as an array', async () => {
    const { sent, service } = savedAdsApi(() => collectionDocument([]));

    await service.save([
      { adId: 'ad-1', brandId: 'brand-1', source: 'public' },
    ]);
    await service.updateNotes([
      { brandId: 'brand-1', id: 'saved-1', note: 'Keep hook' },
    ]);
    await service.unsave([{ brandId: 'brand-1', id: 'saved-1' }]);

    expect(
      sent.map(({ body, method, path }) => ({ body, method, path })),
    ).toEqual([
      {
        body: [{ adId: 'ad-1', brandId: 'brand-1', source: 'public' }],
        method: 'POST',
        path: expect.stringMatching(/\/saved-ads$/),
      },
      {
        body: [{ brandId: 'brand-1', id: 'saved-1', note: 'Keep hook' }],
        method: 'PATCH',
        path: expect.stringMatching(/\/saved-ads$/),
      },
      {
        body: [{ brandId: 'brand-1', id: 'saved-1' }],
        method: 'DELETE',
        path: expect.stringMatching(/\/saved-ads$/),
      },
    ]);
  });

  it("walks every page of a brand's saved ads", async () => {
    const { sent, service } = savedAdsApi(({ params }) =>
      (params as { page: number }).page === 1
        ? savedAdsPage('saved-1', 1)
        : savedAdsPage('saved-2', 2),
    );

    const savedAds = await service.list('brand-1');

    expect(savedAds.map((ad) => ad.id)).toEqual(['saved-1', 'saved-2']);
    expect(sent.map(({ method, params }) => ({ method, params }))).toEqual([
      { method: 'GET', params: { brandId: 'brand-1', limit: 100, page: 1 } },
      { method: 'GET', params: { brandId: 'brand-1', limit: 100, page: 2 } },
    ]);
  });
});
