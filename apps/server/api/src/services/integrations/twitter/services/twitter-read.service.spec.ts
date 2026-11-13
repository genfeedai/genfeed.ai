import type { LoggerService } from '@libs/logger/logger.service';
import type { TwitterApi } from 'twitter-api-v2';
import { TwitterReadService } from './twitter-read.service';
import type { TwitterResponseMapper } from './twitter-response.mapper';

describe('TwitterReadService', () => {
  it('keeps the provider path and response-mapper contract explicit', async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: 'user-1' }] });
    const mapped = [{ followersCount: 4, id: 'user-1', username: 'creator' }];
    const mapper = { mapUsers: vi.fn().mockReturnValue(mapped) };
    const service = new TwitterReadService(
      { error: vi.fn() } as unknown as LoggerService,
      mapper as unknown as TwitterResponseMapper,
      () => ({ v2: { get } }) as unknown as TwitterApi,
    );

    await expect(
      service.getUsers('users/user-1/followers', 250),
    ).resolves.toEqual(mapped);
    expect(get).toHaveBeenCalledWith('users/user-1/followers', {
      max_results: 100,
      'user.fields': 'public_metrics',
    });
    expect(mapper.mapUsers).toHaveBeenCalledWith({
      data: [{ id: 'user-1' }],
    });
  });

  it('sends since_id to recent search so callers can read only new tweets', async () => {
    const search = vi.fn().mockResolvedValue({ data: { data: [] } });
    const mapper = { mapSearchResults: vi.fn().mockReturnValue([]) };
    const service = new TwitterReadService(
      { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
      mapper as unknown as TwitterResponseMapper,
      () => ({ v2: { search } }) as unknown as TwitterApi,
    );

    await service.searchRecentTweets('@creator', {
      maxResults: 25,
      sinceId: '1850000000000000000',
      sortOrder: 'recency',
    });

    expect(search).toHaveBeenCalledWith(
      '@creator',
      expect.objectContaining({
        max_results: 25,
        since_id: '1850000000000000000',
        sort_order: 'recency',
      }),
    );
  });

  it('asks X for the avatar and bio when resolving a user by username', async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: 'u1' } });
    const mapped = {
      description: 'Shipping daily',
      id: 'u1',
      profileImageUrl: 'https://pbs.twimg.com/a.jpg',
      username: 'creator',
    };
    const mapper = { mapUser: vi.fn().mockReturnValue(mapped) };
    const service = new TwitterReadService(
      { error: vi.fn() } as unknown as LoggerService,
      mapper as unknown as TwitterResponseMapper,
      () => ({ v2: { get } }) as unknown as TwitterApi,
    );

    await expect(service.getUserByUsername('@creator')).resolves.toEqual(
      mapped,
    );
    expect(get).toHaveBeenCalledWith('users/by/username/creator', {
      'user.fields': 'public_metrics,profile_image_url,description',
    });
  });
});
