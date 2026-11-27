import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenVideoToolsService } from '@api/services/integrations/heygen/services/heygen-video-tools.service';
import type { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import type { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

interface Reply {
  data: unknown;
}

/** Answers each URL from a table; a POST answers with `posted`. */
function createService(replies: Record<string, unknown>, posted: unknown) {
  const sent: { body: unknown; url: string }[] = [];
  const httpService = {
    get: (url: string) => of<Reply>({ data: replies[url] }),
    post: (url: string, body: unknown) => {
      sent.push({ body, url });
      return of<Reply>({ data: posted });
    },
  } as unknown as HttpService;
  const pollUntilService = {
    poll: async <T>(read: () => Promise<T>) => ({ value: await read() }),
  } as unknown as PollUntilService;
  const heyGenService = {
    resolveOrganizationConnection: async () => ({ apiKey: 'platform-key' }),
  } as unknown as HeyGenService;
  return {
    sent,
    service: new HeyGenVideoToolsService(
      httpService,
      pollUntilService,
      heyGenService,
    ),
  };
}

describe('HeyGenVideoToolsService', () => {
  it('returns the finished video of a completed Video Agent session', async () => {
    const { sent, service } = createService(
      {
        'https://api.heygen.com/v3/video-agents/s1': {
          data: { status: 'completed', video_id: 'v1' },
        },
        'https://api.heygen.com/v3/videos/v1': {
          data: { status: 'completed', video_url: 'https://cdn.test/v1.mp4' },
        },
      },
      { data: { session_id: 's1' } },
    );
    await expect(
      service.generateVideoAgentVideo({ prompt: 'a launch ad' }),
    ).resolves.toEqual({ videoUrl: 'https://cdn.test/v1.mp4' });
    expect(sent).toEqual([
      {
        body: { prompt: 'a launch ad' },
        url: 'https://api.heygen.com/v3/video-agents',
      },
    ]);
  });

  it('reports the failure message of a failed Video Agent session', async () => {
    const { service } = createService(
      {
        'https://api.heygen.com/v3/video-agents/s1': {
          data: { failure_message: 'no credits', status: 'failed' },
        },
      },
      { data: { session_id: 's1' } },
    );
    await expect(
      service.generateVideoAgentVideo({ prompt: 'a launch ad' }),
    ).rejects.toThrow('no credits');
  });

  it('returns one video per translated language', async () => {
    const { sent, service } = createService(
      {
        'https://api.heygen.com/v3/video-translations/t1': {
          data: {
            outputs: [{ language: 'es', video_url: 'https://cdn.test/es.mp4' }],
            status: 'completed',
          },
        },
      },
      { data: { video_translation_id: 't1' } },
    );
    await expect(
      service.translateVideo({
        languages: ['es'],
        videoUrl: 'https://cdn.test/source.mp4',
      }),
    ).resolves.toEqual({
      outputs: [{ language: 'es', videoUrl: 'https://cdn.test/es.mp4' }],
    });
    expect(sent[0]?.body).toEqual({
      output_languages: ['es'],
      video: { type: 'url', url: 'https://cdn.test/source.mp4' },
    });
  });

  it('refuses a translation without a language before calling HeyGen', async () => {
    const { sent, service } = createService({}, {});
    await expect(
      service.translateVideo({
        languages: [],
        videoUrl: 'https://cdn.test/source.mp4',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sent).toEqual([]);
  });
});
