import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FacebookLivePostService } from '@api/services/integrations/facebook/services/facebook-live-post.service';
import { describe, expect, it } from 'vitest';

const SCOPE = {
  brandId: 'brand-1',
  credentialId: 'cred-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

/** A posts store the service writes to and reads back, as the real one does. */
function createPosts() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    posts: {
      create: async (dto: Record<string, unknown>) => {
        const row = { ...dto, id: 'post-1' };
        rows.set('post-1', row);
        return row;
      },
      findOne: async (where: { id: string; organizationId: string }) => {
        const row = rows.get(where.id);
        return row?.organizationId === where.organizationId ? row : null;
      },
      patch: async (id: string, dto: Record<string, unknown>) => {
        const row = { ...rows.get(id), ...dto };
        rows.set(id, row);
        return row;
      },
    },
    rows,
  };
}

function createService(endStatus: { isLive: boolean } = { isLive: false }) {
  const { posts, rows } = createPosts();
  const service = new FacebookLivePostService(
    {
      end: async () => ({
        ...endStatus,
        permalinkUrl: 'https://www.facebook.com/page-1/videos/live-1',
        status: endStatus.isLive ? 'LIVE' : 'LIVE_STOPPED',
      }),
      start: async () => ({
        liveVideoId: 'live-1',
        permalinkUrl: 'https://www.facebook.com/page-1/videos/live-1',
        streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/KEY-1',
      }),
    } as never,
    posts as never,
  );

  return { rows, service };
}

describe('FacebookLivePostService', () => {
  it('stores the live video as a published post and hands the stream key to the caller only', async () => {
    const { rows, service } = createService();

    const started = await service.start(SCOPE, { title: 'Launch day' });

    expect(started).toEqual({
      liveVideoId: 'live-1',
      permalinkUrl: 'https://www.facebook.com/page-1/videos/live-1',
      postId: 'post-1',
      state: 'live',
      streamKey: 'KEY-1',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp',
    });
    const stored = rows.get('post-1');
    expect(stored).toMatchObject({
      category: 'VIDEO',
      credentialId: 'cred-1',
      externalId: 'live-1',
      platform: 'facebook',
      targetExecutionState: 'published',
      targetSettings: { live: { state: 'live' } },
      url: 'https://www.facebook.com/page-1/videos/live-1',
    });
    expect(JSON.stringify(stored)).not.toContain('KEY-1');
  });

  it('records the final state and the time it ended on the post', async () => {
    const { rows, service } = createService({ isLive: false });
    await service.start(SCOPE, { title: 'Launch day' });

    const ended = await service.end(SCOPE, 'post-1');

    expect(ended).toMatchObject({
      liveVideoId: 'live-1',
      postId: 'post-1',
      state: 'ended',
    });
    const settings = rows.get('post-1')?.targetSettings as {
      live: { endedAt?: string; state: string };
    };
    expect(settings.live.state).toBe('ended');
    expect(Date.parse(settings.live.endedAt ?? '')).not.toBeNaN();
  });

  it('keeps the post live when Facebook still reports the video on air', async () => {
    const { rows, service } = createService({ isLive: true });
    await service.start(SCOPE, { title: 'Launch day' });

    const ended = await service.end(SCOPE, 'post-1');

    expect(ended.state).toBe('live');
    expect(rows.get('post-1')?.targetSettings).toEqual({
      live: { state: 'live' },
    });
  });

  it('does not end a post from another organization', async () => {
    const { service } = createService();
    await service.start(SCOPE, { title: 'Launch day' });

    await expect(
      service.end({ ...SCOPE, organizationId: 'org-2' }, 'post-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
