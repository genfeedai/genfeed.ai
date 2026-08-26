import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { TiktokAuthorizedSignalsProvider } from './tiktok-authorized-signals.provider';

describe('TiktokAuthorizedSignalsProvider', () => {
  it('maps user and public-video responses independently', async () => {
    const httpService = {
      get: vi
        .fn()
        .mockReturnValue(
          of({ data: { data: { user: { display_name: 'Creator' } } } }),
        ),
      post: vi.fn().mockReturnValue(
        of({
          data: {
            data: {
              has_more: true,
              videos: [
                {
                  comment_count: 2,
                  id: 'video-1',
                  like_count: 8,
                  view_count: 100,
                },
              ],
            },
          },
        }),
      ),
    } as unknown as HttpService;
    const provider = new TiktokAuthorizedSignalsProvider(
      httpService,
      'https://open.tiktokapis.com/v2',
      'application/json; charset=UTF-8',
    );

    const result = await provider.fetch(
      'token',
      ['user.info.basic', 'video.list'],
      {
        user: ['user.info.basic', 'user.info.profile', 'user.info.stats'],
        videoList: 'video.list',
        videoPublish: 'video.publish',
      },
    );

    expect(result.userInfoResult.value).toEqual({ display_name: 'Creator' });
    expect(result.videosResult.value).toEqual({
      hasMore: true,
      rawVideoCount: 1,
      videos: [
        expect.objectContaining({
          commentCount: 2,
          id: 'video-1',
          likeCount: 8,
          viewCount: 100,
        }),
      ],
    });
    expect(result.creatorInfoResult).toEqual({});
  });
});
