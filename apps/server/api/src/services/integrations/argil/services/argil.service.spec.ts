import type { ByokService } from '@api/services/byok/byok.service';
import {
  ArgilService,
  type GenerateArgilVideoInput,
} from '@api/services/integrations/argil/services/argil.service';
import type { ArgilWebhookTokenService } from '@api/services/integrations/argil/services/argil-webhook-token.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

interface ArgilVideo {
  body: Record<string, unknown>;
  callbackUrl?: string;
  createdWithKey: string;
  renderedWithKey?: string;
  status: string;
  videoUrl?: string;
}

interface RequestOptions {
  headers: Record<string, string>;
}

const ARGIL = 'https://api.argil.ai/v1';

describe('ArgilService', () => {
  let byokKeys: Map<string, string>;
  let config: Map<string, string>;
  let catalogs: Map<string, unknown>;
  let timeline: string[];
  let videos: Map<string, ArgilVideo>;
  let createdVideoId: string;
  let service: ArgilService;

  const generate = (input: Partial<GenerateArgilVideoInput> = {}) =>
    service.generateAvatarVideo({
      avatarId: 'avatar-1',
      callbackId: 'clip-1',
      onVideoCreated: async (videoId) => {
        timeline.push(`video ${videoId} recorded`);
      },
      organizationId: 'org-1',
      script: 'Hello from Genfeed',
      voiceId: 'voice-1',
      ...input,
    });

  beforeEach(() => {
    byokKeys = new Map([['org-1', 'org-key']]);
    config = new Map([['GENFEEDAI_WEBHOOKS_URL', 'https://hooks.example.com']]);
    catalogs = new Map();
    timeline = [];
    videos = new Map();
    createdVideoId = 'video-1';

    const byok = {
      lookupApiKey: async (organizationId: string, provider: ByokProvider) => {
        const apiKey =
          provider === ByokProvider.ARGIL
            ? byokKeys.get(organizationId)
            : undefined;
        return apiKey ? { apiKey } : undefined;
      },
    } as unknown as ByokService;
    const configService = {
      get: (key: string) => config.get(key),
    } as unknown as ConfigService;
    const tokens = {
      create: (videoId: string) =>
        config.has('ARGIL_WEBHOOK_SECRET') ? `signed-${videoId}` : undefined,
    } as unknown as ArgilWebhookTokenService;

    // The Argil API: creating a video, starting its render, reading it back
    // and listing catalogs, each answering under the caller's key.
    const render = /^https:\/\/api\.argil\.ai\/v1\/videos\/([^/]+)\/render$/;
    const http = {
      get: (url: string, options: RequestOptions) => {
        const videoId = url.replace(`${ARGIL}/videos/`, '');
        const video = videos.get(videoId);
        if (video?.createdWithKey === options.headers['x-api-key']) {
          return of({ data: { data: { id: videoId, ...video } } });
        }
        return catalogs.has(url)
          ? of({ data: catalogs.get(url) })
          : throwError(() => new Error(`404 ${url}`));
      },
      post: (
        url: string,
        body: Record<string, unknown>,
        options: RequestOptions,
      ) => {
        const apiKey = options.headers['x-api-key'];
        if (url === `${ARGIL}/videos`) {
          timeline.push(`video ${createdVideoId} created`);
          videos.set(createdVideoId, {
            body,
            createdWithKey: apiKey,
            status: 'IDLE',
          });
          return of({ data: { videoId: createdVideoId } });
        }
        const videoId = render.exec(url)?.[1] ?? '';
        const video = videos.get(videoId);
        if (!video) {
          return throwError(() => new Error(`404 ${url}`));
        }
        timeline.push(`video ${videoId} rendering`);
        Object.assign(video, {
          callbackUrl: body.callbackUrl,
          renderedWithKey: apiKey,
          status: 'GENERATING_AUDIO',
        });
        return of({ data: {} });
      },
    } as unknown as HttpService;
    const logger = { log: () => undefined } as unknown as LoggerService;

    config.set('ARGIL_WEBHOOK_SECRET', 'secret');
    service = new ArgilService(byok, configService, http, logger, tokens);
  });

  it('creates an Atom video, records it, then renders it with a signed callback', async () => {
    await expect(generate()).resolves.toBe('video-1');

    expect(videos.get('video-1')).toEqual({
      body: {
        aspectRatio: '9:16',
        extras: { callbackId: 'clip-1' },
        model: 'ARGIL_ATOM',
        moments: [
          {
            avatarId: 'avatar-1',
            transcript: 'Hello from Genfeed',
            voiceId: 'voice-1',
          },
        ],
        name: 'Genfeed clip clip-1',
      },
      callbackUrl:
        'https://hooks.example.com/v1/webhooks/argil/callback?token=signed-video-1',
      createdWithKey: 'org-key',
      renderedWithKey: 'org-key',
      status: 'GENERATING_AUDIO',
    });
    expect(timeline).toEqual([
      'video video-1 created',
      'video video-1 recorded',
      'video video-1 rendering',
    ]);
  });

  it('renders on the platform key when the organization has none', async () => {
    byokKeys.clear();
    config.set('ARGIL_KEY', 'platform-key');
    let funding: boolean | undefined;

    await generate({
      beforeSubmission: async (isByok) => {
        funding = isByok;
      },
    });

    expect(funding).toBe(false);
    expect(videos.get('video-1')).toMatchObject({
      createdWithKey: 'platform-key',
      renderedWithKey: 'platform-key',
    });
  });

  it('pins the customer key across funding and both vendor requests', async () => {
    await generate({
      beforeSubmission: async () => {
        byokKeys.clear();
      },
    });

    expect(videos.get('video-1')).toMatchObject({
      createdWithKey: 'org-key',
      renderedWithKey: 'org-key',
    });
  });

  it('refuses a platform submission before any vendor call when funding fails', async () => {
    byokKeys.clear();
    config.set('ARGIL_KEY', 'platform-key');

    await expect(
      generate({
        beforeSubmission: async () => {
          throw new Error('Clip pricing unavailable');
        },
      }),
    ).rejects.toThrow('Clip pricing unavailable');
    expect(videos.size).toBe(0);
  });

  it('refuses without any Argil key', async () => {
    byokKeys.clear();

    await expect(generate()).rejects.toThrow('No Argil API key configured');
    expect(videos.size).toBe(0);
  });

  it.each<[string, [string, string][]]>([
    [
      'without a webhook secret',
      [['GENFEEDAI_WEBHOOKS_URL', 'https://hooks.example.com']],
    ],
    [
      'on an HTTP webhook URL',
      [
        ['ARGIL_WEBHOOK_SECRET', 'secret'],
        ['GENFEEDAI_WEBHOOKS_URL', 'http://tunnel.example.com'],
      ],
    ],
  ])('creates but never renders %s', async (_case, entries) => {
    config = new Map(entries);

    await expect(generate()).rejects.toThrow('requires an HTTPS webhook URL');
    expect(videos.get('video-1')).toMatchObject({ status: 'IDLE' });
    expect(timeline).toEqual([
      'video video-1 created',
      'video video-1 recorded',
    ]);
  });

  it('reads back a finished video', async () => {
    await generate();
    Object.assign(videos.get('video-1') ?? {}, {
      status: 'DONE',
      videoUrl: 'https://cdn.argil.ai/video-1.mp4',
    });

    await expect(service.getVideoStatus('video-1', 'org-1')).resolves.toEqual({
      error: undefined,
      id: 'video-1',
      status: 'DONE',
      videoUrl: 'https://cdn.argil.ai/video-1.mp4',
    });
  });

  it('reads an unknown render state as still generating', async () => {
    await generate();
    Object.assign(videos.get('video-1') ?? {}, { status: 'QUEUED' });

    await expect(
      service.getVideoStatus('video-1', 'org-1'),
    ).resolves.toMatchObject({ status: 'GENERATING_VIDEO' });
  });

  it.each([
    [
      'avatars',
      () => service.getAvatars('org-1'),
      {
        avatars: [
          {
            id: 'avatar-1',
            name: 'Presenter',
            thumbnailUrl: 'https://cdn.argil.ai/avatar.png',
          },
          { name: 'No id' },
        ],
      },
      [
        {
          id: 'avatar-1',
          name: 'Presenter',
          previewUrl: 'https://cdn.argil.ai/avatar.png',
        },
      ],
    ],
    [
      'voices',
      () => service.getVoices('org-1'),
      {
        data: [{ audioUrl: 'https://cdn.argil.ai/v.mp3', voiceId: 'voice-1' }],
      },
      [
        {
          id: 'voice-1',
          name: 'voice-1',
          previewUrl: 'https://cdn.argil.ai/v.mp3',
        },
      ],
    ],
  ])('normalizes the %s catalog', async (path, list, response, expected) => {
    catalogs.set(`${ARGIL}/${path}`, response);

    await expect(list()).resolves.toEqual(expected);
  });
});
