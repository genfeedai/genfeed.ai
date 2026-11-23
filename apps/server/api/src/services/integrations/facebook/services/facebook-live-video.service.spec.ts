import { FacebookLiveVideoService } from '@api/services/integrations/facebook/services/facebook-live-video.service';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

interface GraphRequest {
  method: 'GET' | 'POST';
  params: Record<string, unknown>;
  url: string;
}

const SCOPE = {
  brandId: 'brand-1',
  credentialId: 'cred-1',
  organizationId: 'org-1',
};

function createService(options: {
  grantedScopes?: string[] | undefined;
  /** The statuses a video reports on each read, in order. */
  statuses?: string[];
}) {
  const requests: GraphRequest[] = [];
  const logged: unknown[] = [];
  const statuses = [...(options.statuses ?? ['LIVE_STOPPED'])];
  const service = new FacebookLiveVideoService(
    { get: () => undefined } as never,
    {
      resolveBrandAccount: async () => ({
        externalId: 'page-1',
        grantedScopes:
          'grantedScopes' in options
            ? options.grantedScopes
            : ['publish_video'],
        id: 'cred-1',
      }),
    } as never,
    {
      getUserPages: async () => [{ accessToken: 'page-token', id: 'page-1' }],
    } as never,
    {
      get: (url: string, config: { params: Record<string, unknown> }) => {
        requests.push({ method: 'GET', params: config.params, url });
        return of({
          data: {
            id: 'live-1',
            permalink_url: '/page-1/videos/live-1',
            status: statuses.shift() ?? 'LIVE_STOPPED',
          },
        });
      },
      post: (
        url: string,
        _body: unknown,
        config: { params: Record<string, unknown> },
      ) => {
        requests.push({ method: 'POST', params: config.params, url });
        return of({
          data: {
            id: 'live-1',
            permalink_url: '/page-1/videos/live-1',
            secure_stream_url: 'rtmps://live-api-s.facebook.com:443/rtmp/KEY-1',
            status: 'LIVE_NOW',
          },
        });
      },
    } as never,
    {
      log: (...args: unknown[]) => logged.push(args),
    } as never,
  );

  return { logged, requests, service };
}

describe('FacebookLiveVideoService.start', () => {
  it('creates a live video on the Page and returns its stream address and link', async () => {
    const { requests, service } = createService({});

    const started = await service.start(SCOPE, {
      description: 'Launch',
      title: 'Launch day',
    });

    expect(started).toEqual({
      liveVideoId: 'live-1',
      permalinkUrl: 'https://www.facebook.com/page-1/videos/live-1',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/KEY-1',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toMatch(/\/page-1\/live_videos$/);
    expect(requests[0]?.params).toMatchObject({
      access_token: 'page-token',
      description: 'Launch',
      status: 'LIVE_NOW',
      title: 'Launch day',
    });
  });

  it('never writes the stream key to the log', async () => {
    const { logged, service } = createService({});

    await service.start(SCOPE, { title: 'Launch day' });

    expect(JSON.stringify(logged)).not.toContain('KEY-1');
  });

  it('asks for a reconnect, without calling Facebook, when publish_video was not granted', async () => {
    const { requests, service } = createService({
      grantedScopes: ['pages_manage_posts'],
    });

    await expect(service.start(SCOPE, { title: 'Launch day' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.start(SCOPE, { title: 'Launch day' })).rejects.toThrow(
      /publish_video/,
    );
    expect(requests).toHaveLength(0);
  });
});

describe('FacebookLiveVideoService.end', () => {
  it('ends a live video that is on air and reports it ended', async () => {
    const { requests, service } = createService({
      statuses: ['LIVE', 'LIVE_STOPPED'],
    });

    const state = await service.end(SCOPE, 'live-1');

    expect(state).toEqual({
      isLive: false,
      permalinkUrl: 'https://www.facebook.com/page-1/videos/live-1',
      status: 'LIVE_STOPPED',
    });
    const posts = requests.filter((request) => request.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toMatch(/\/live-1$/);
    expect(posts[0]?.params.end_live_video).toBe(true);
  });

  it('leaves a video that already ended alone', async () => {
    const { requests, service } = createService({
      statuses: ['VOD', 'VOD'],
    });

    const state = await service.end(SCOPE, 'live-1');

    expect(state.isLive).toBe(false);
    expect(
      requests.filter((request) => request.method === 'POST'),
    ).toHaveLength(0);
  });
});
