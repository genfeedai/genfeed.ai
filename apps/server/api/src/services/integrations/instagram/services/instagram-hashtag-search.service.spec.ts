import {
  InstagramHashtagAccessError,
  InstagramHashtagBudgetError,
  InstagramHashtagSearchService,
  normalizeInstagramHashtag,
} from '@api/services/integrations/instagram/services/instagram-hashtag-search.service';
import {
  INSTAGRAM_HASHTAG_WEEKLY_LIMIT,
  INSTAGRAM_HASHTAG_WINDOW_MS,
} from '@genfeedai/contracts/constants';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-11-23T12:00:00Z');

interface GraphRequest {
  params: Record<string, unknown>;
  url: string;
}

function createService(options: {
  ledger?: Record<string, number>;
  searchError?: unknown;
}) {
  const requests: GraphRequest[] = [];
  const store = new Map<string, unknown>();
  if (options.ledger)
    store.set('instagram:hashtag-budget:cred-1', options.ledger);
  const service = new InstagramHashtagSearchService(
    {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        store.set(key, structuredClone(value));
        return true;
      },
    } as never,
    {
      get: (url: string, config: { params: Record<string, unknown> }) => {
        requests.push({ params: config.params, url });
        if (options.searchError && url.endsWith('/ig_hashtag_search')) {
          return throwError(() => options.searchError);
        }
        if (url.endsWith('/ig_hashtag_search')) {
          return of({ data: { data: [{ id: `id-${config.params.q}` }] } });
        }
        return of({
          data: {
            data: [
              {
                caption: 'A post',
                comments_count: 2,
                id: 'media-1',
                like_count: 40,
                media_type: 'IMAGE',
                media_url: 'https://cdn.example/1.jpg',
                permalink: 'https://www.instagram.com/p/abc/',
                timestamp: '2026-11-22T08:00:00+0000',
              },
              { id: 'no-permalink' },
            ],
          },
        });
      },
    } as never,
    {
      getGraphApiBaseUrl: () => 'https://graph.example/v1',
      getValidCredential: async () => ({
        accessToken: EncryptionUtil.encrypt('user-token'),
        externalId: 'ig-user-1',
        id: 'cred-1',
      }),
    } as never,
    { log: vi.fn() } as never,
  );

  return { requests, service, store };
}

describe('InstagramHashtagSearchService', () => {
  it('reads the top media of a tracked hashtag with the account token', async () => {
    vi.useFakeTimers({ now: NOW });
    const { requests, service } = createService({});

    const result = await service.readTopMedia('org-1', 'brand-1', ['#Coffee']);

    expect(result).toEqual([
      {
        hashtag: 'coffee',
        items: [
          {
            caption: 'A post',
            commentsCount: 2,
            id: 'media-1',
            likeCount: 40,
            mediaType: 'IMAGE',
            mediaUrl: 'https://cdn.example/1.jpg',
            permalink: 'https://www.instagram.com/p/abc/',
            timestamp: '2026-11-22T08:00:00+0000',
          },
        ],
      },
    ]);
    expect(requests[0]).toMatchObject({
      params: { access_token: 'user-token', q: 'coffee', user_id: 'ig-user-1' },
      url: 'https://graph.example/v1/ig_hashtag_search',
    });
    expect(requests[1]?.url).toBe(
      'https://graph.example/v1/id-coffee/top_media',
    );
    expect(requests[1]?.params.fields).toContain('permalink');
    expect(requests[1]?.params.fields).not.toContain('username');
    vi.useRealTimers();
  });

  it('spends at most five hashtags a refresh and records each in the week ledger', async () => {
    vi.useFakeTimers({ now: NOW });
    const { service, store } = createService({});

    const result = await service.readTopMedia('org-1', 'brand-1', [
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);

    expect(result.map((entry) => entry.hashtag)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(
      Object.keys(store.get('instagram:hashtag-budget:cred-1') as object),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
    vi.useRealTimers();
  });

  it('does not spend the budget again on a hashtag already queried this week', async () => {
    vi.useFakeTimers({ now: NOW });
    const ledger = Object.fromEntries(
      Array.from({ length: INSTAGRAM_HASHTAG_WEEKLY_LIMIT }, (_, index) => [
        `tag${index}`,
        NOW - 1000,
      ]),
    );
    const { service } = createService({ ledger });

    const result = await service.readTopMedia('org-1', 'brand-1', [
      'brand-new',
      'tag3',
    ]);

    // The week's 30 are spent: the new hashtag waits, the known one still reads.
    expect(result.map((entry) => entry.hashtag)).toEqual(['tag3']);
    vi.useRealTimers();
  });

  it('refuses, naming the budget, when no candidate is affordable', async () => {
    vi.useFakeTimers({ now: NOW });
    const ledger = Object.fromEntries(
      Array.from({ length: INSTAGRAM_HASHTAG_WEEKLY_LIMIT }, (_, index) => [
        `tag${index}`,
        NOW - 1000,
      ]),
    );
    const { requests, service } = createService({ ledger });

    await expect(
      service.readTopMedia('org-1', 'brand-1', ['brand-new']),
    ).rejects.toBeInstanceOf(InstagramHashtagBudgetError);
    expect(requests).toHaveLength(0);
    vi.useRealTimers();
  });

  it('frees a hashtag once its week is over', async () => {
    vi.useFakeTimers({ now: NOW });
    const ledger = Object.fromEntries(
      Array.from({ length: INSTAGRAM_HASHTAG_WEEKLY_LIMIT }, (_, index) => [
        `tag${index}`,
        NOW - INSTAGRAM_HASHTAG_WINDOW_MS - 1000,
      ]),
    );
    const { service } = createService({ ledger });

    const result = await service.readTopMedia('org-1', 'brand-1', [
      'brand-new',
    ]);

    expect(result.map((entry) => entry.hashtag)).toEqual(['brandnew']);
    vi.useRealTimers();
  });

  it('reports a missing Public Content Access as an access error', async () => {
    const { service } = createService({
      searchError: { response: { data: { error: { code: 10 } }, status: 400 } },
    });

    await expect(
      service.readTopMedia('org-1', 'brand-1', ['coffee']),
    ).rejects.toBeInstanceOf(InstagramHashtagAccessError);
  });
});

describe('normalizeInstagramHashtag', () => {
  it('keeps one lowercase word, without the hash or punctuation', () => {
    expect(normalizeInstagramHashtag('#Café Latte!')).toBe('cafélatte');
    expect(normalizeInstagramHashtag('brand-new')).toBe('brandnew');
  });
});
