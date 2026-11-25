import {
  postTikTokInit,
  wantsTikTokAiLabel,
} from '@api/services/integrations/tiktok/services/tiktok-ai-label.util';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

const config = { headers: { Authorization: 'Bearer token' } };
const videoBody = {
  post_info: { privacy_level: 'SELF_ONLY', title: 'clip' },
  source_info: { source: 'PULL_FROM_URL', video_url: 'https://cdn.test/a.mp4' },
};

function createHttp(refuseLabelWith?: number) {
  const bodies: Record<string, unknown>[] = [];
  const http = {
    post: vi.fn((_url: string, body: Record<string, unknown>) => {
      bodies.push(body);
      const carriesLabel =
        'is_aigc' in body ||
        'is_aigc' in ((body.post_info as Record<string, unknown>) ?? {});
      return refuseLabelWith && carriesLabel
        ? throwError(() => ({ response: { status: refuseLabelWith } }))
        : of({ data: { data: { publish_id: 'p1' } } });
    }),
  };
  return { bodies, http: http as unknown as HttpService };
}

const logger = { warn: vi.fn() } as unknown as LoggerService;

describe('postTikTokInit', () => {
  it('puts the label in post_info for a video', async () => {
    const { bodies, http } = createHttp();

    await postTikTokInit(http, logger, 'url', videoBody, config, 'post_info');

    expect(bodies).toEqual([
      {
        ...videoBody,
        post_info: { ...videoBody.post_info, is_aigc: true },
      },
    ]);
  });

  it('puts the label at the top of the body for a photo post', async () => {
    const { bodies, http } = createHttp();

    await postTikTokInit(http, logger, 'url', videoBody, config, 'body');

    expect(bodies).toEqual([{ ...videoBody, is_aigc: true }]);
  });

  it('sends no label when none is asked for', async () => {
    const { bodies, http } = createHttp();

    await postTikTokInit(http, logger, 'url', videoBody, config);

    expect(bodies).toEqual([videoBody]);
  });

  it('sends the request again without the label when TikTok refuses it with a 400, and still starts the publish', async () => {
    const { bodies, http } = createHttp(400);

    const response = await postTikTokInit(
      http,
      logger,
      'url',
      videoBody,
      config,
      'post_info',
    );

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(videoBody);
    expect(response.data.data.publish_id).toBe('p1');
  });

  it('does not retry a server error', async () => {
    const { bodies, http } = createHttp(500);

    await expect(
      postTikTokInit(http, logger, 'url', videoBody, config, 'post_info'),
    ).rejects.toMatchObject({ response: { status: 500 } });
    expect(bodies).toHaveLength(1);
  });
});

describe('wantsTikTokAiLabel', () => {
  it.each([
    [{ aiGenerated: true }, true],
    [{ aiGenerated: false }, false],
    [{}, false],
  ])('reads %j as %s', (settings, expected) => {
    expect(wantsTikTokAiLabel(settings)).toBe(expected);
  });
});
