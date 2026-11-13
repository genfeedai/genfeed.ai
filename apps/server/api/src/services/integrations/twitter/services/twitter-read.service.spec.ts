import type { LoggerService } from '@libs/logger/logger.service';
import type { TwitterApi } from 'twitter-api-v2';
import { TwitterReadService } from './twitter-read.service';
import type { TwitterResponseMapper } from './twitter-response.mapper';

interface EchoedRequest {
  params: Record<string, unknown>;
  path?: string;
  query?: string;
}

const logger = { error: () => undefined, log: () => undefined };

/**
 * A fake X client that answers every request with the request itself, and a
 * mapper that passes the response through. The service result then shows
 * exactly what was sent to X.
 */
function createEchoService(): TwitterReadService {
  const client = {
    v2: {
      get: async (path: string, params: Record<string, unknown>) => ({
        data: { params, path },
      }),
      search: async (query: string, params: Record<string, unknown>) => ({
        data: { params, query },
      }),
    },
  };
  const mapper = {
    mapSearchResults: (response: { data: EchoedRequest }) => [response.data],
    mapUser: (response: { data: EchoedRequest }) => response.data,
    mapUsers: (response: { data: EchoedRequest }) => [response.data],
  };

  return new TwitterReadService(
    logger as unknown as LoggerService,
    mapper as unknown as TwitterResponseMapper,
    () => client as unknown as TwitterApi,
  );
}

describe('TwitterReadService', () => {
  it('caps follower lists at 100 users and asks X for public metrics', async () => {
    const service = createEchoService();

    await expect(
      service.getUsers('users/user-1/followers', 250),
    ).resolves.toEqual([
      {
        params: { max_results: 100, 'user.fields': 'public_metrics' },
        path: 'users/user-1/followers',
      },
    ]);
  });

  it('sends since_id to recent search so callers can read only new tweets', async () => {
    const service = createEchoService();

    const [request] = (await service.searchRecentTweets('@creator', {
      maxResults: 25,
      sinceId: '1850000000000000000',
      sortOrder: 'recency',
    })) as unknown as EchoedRequest[];

    expect(request.query).toBe('@creator');
    expect(request.params).toMatchObject({
      max_results: 25,
      since_id: '1850000000000000000',
      sort_order: 'recency',
    });
  });

  it('leaves since_id out of recent search when the caller gives none', async () => {
    const service = createEchoService();

    const [request] = (await service.searchRecentTweets('ai video', {
      maxResults: 10,
    })) as unknown as EchoedRequest[];

    expect(request.params).not.toHaveProperty('since_id');
  });

  it('asks X for the avatar and bio when resolving a user by username', async () => {
    const service = createEchoService();

    await expect(service.getUserByUsername('@creator')).resolves.toEqual({
      params: {
        'user.fields': 'public_metrics,profile_image_url,description',
      },
      path: 'users/by/username/creator',
    });
  });
});
