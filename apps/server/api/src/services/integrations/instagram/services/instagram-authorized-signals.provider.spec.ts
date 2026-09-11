import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { InstagramAuthorizedSignalsProvider } from './instagram-authorized-signals.provider';

describe('InstagramAuthorizedSignalsProvider', () => {
  it('maps profile and owned-media provider responses', async () => {
    const httpService = {
      get: vi.fn((url: string) =>
        of(
          url.endsWith('/account-1')
            ? { data: { followers_count: 12, id: 'account-1' } }
            : {
                data: {
                  data: [
                    {
                      comments_count: 2,
                      id: 'media-1',
                      like_count: 5,
                      permalink: 'https://instagram.com/p/media-1',
                      timestamp: '2026-08-01T12:00:00.000Z',
                    },
                  ],
                },
              },
        ),
      ),
    } as unknown as HttpService;
    const provider = new InstagramAuthorizedSignalsProvider(
      httpService,
      'https://graph.facebook.com',
      'v24.0',
    );

    const result = await provider.fetch(
      'token',
      'account-1',
      ['instagram_basic'],
      'instagram_basic',
      'instagram_manage_insights',
    );

    expect(result.profileResult.value).toEqual({
      followers_count: 12,
      id: 'account-1',
    });
    expect(result.mediaResult.value).toEqual({
      hasMore: false,
      media: [
        expect.objectContaining({
          commentCount: 2,
          id: 'media-1',
          likeCount: 5,
        }),
      ],
      performance: [
        expect.objectContaining({
          commentCount: 2,
          id: 'media-1',
          likeCount: 5,
        }),
      ],
      rawMediaCount: 1,
    });
  });

  it('fails clearly instead of guessing an account when the credential has no externalId', async () => {
    // Regression: this provider used to fall back to Graph's `me/accounts`
    // and silently pick the first Facebook Page's IG account. A brand can
    // manage several, so that guess could attribute signals to the wrong
    // account. Resolution now happens once at connect time and is persisted
    // as `credential.externalId` — this must fail loudly when that is
    // missing rather than re-guess.
    const httpGet = vi.fn();
    const httpService = { get: httpGet } as unknown as HttpService;
    const provider = new InstagramAuthorizedSignalsProvider(
      httpService,
      'https://graph.facebook.com',
      'v24.0',
    );

    const result = await provider.fetch(
      'token',
      undefined,
      ['instagram_basic'],
      'instagram_basic',
      'instagram_manage_insights',
    );

    expect(httpGet).not.toHaveBeenCalled();
    expect(result.profileResult.error).toEqual(
      expect.objectContaining({
        response: expect.objectContaining({
          data: expect.objectContaining({
            error: expect.objectContaining({ code: 10 }),
          }),
        }),
      }),
    );
    expect(result.mediaResult.error).toBeDefined();
  });
});
