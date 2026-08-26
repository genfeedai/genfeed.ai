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
});
