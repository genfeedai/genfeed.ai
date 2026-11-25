import { InstagramPublishingService } from '@api/services/integrations/instagram/services/instagram-publishing.service';
import type { InstagramCredentialResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
    encrypt: vi.fn((value: string) => value),
  },
}));

interface GraphPost {
  params: Record<string, unknown>;
  path: string;
}

/**
 * An HTTP double that records every Graph API create call and answers like it.
 * `refuseLabel` makes Instagram answer a create call that carries `refuseField`
 * (the AI label unless said otherwise) with the given HTTP status, as it would
 * for a parameter it does not accept.
 */
function createGraphDouble(
  refuseLabel?: { status: number; code?: number },
  refuseField:
    | 'alt_text'
    | 'audio_configuration'
    | 'cover_url'
    | 'is_ai_generated' = 'is_ai_generated',
  audioCatalogue: unknown = { audio: [] },
  containerIdFor: (createIndex: number) => string = () => 'container-1',
) {
  const posts: GraphPost[] = [];
  let createIndex = 0;
  const http = {
    get: vi.fn((url: string, _config?: { params: GraphPost['params'] }) =>
      of({
        data: url.endsWith('/ig_audio')
          ? audioCatalogue
          : url.endsWith('/container-1')
            ? { status_code: 'FINISHED' }
            : { shortcode: 'SHORT1' },
      }),
    ),
    post: vi.fn(
      (
        url: string,
        _body: unknown,
        config: { params: GraphPost['params'] },
      ) => {
        posts.push({ params: config.params, path: url.split('/v1/')[1] });
        if (refuseLabel && config.params[refuseField]) {
          return throwError(() => ({
            response: {
              data: {
                error: {
                  code: refuseLabel.code ?? 100,
                  message: '(#100) Invalid parameter',
                },
              },
              status: refuseLabel.status,
            },
          }));
        }
        if (url.endsWith('/media')) {
          createIndex += 1;
          return of({ data: { id: containerIdFor(createIndex) } });
        }
        return of({ data: { id: 'container-1' } });
      },
    ),
  };
  const service = new InstagramPublishingService(
    http as unknown as HttpService,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    'https://graph.test',
    'v1',
    async () =>
      ({
        accessToken: 'token',
        externalId: 'ig-1',
      }) as unknown as InstagramCredentialResponse,
  );
  const createCalls = () =>
    posts.filter((post) => post.path.endsWith('/media'));
  const publishCalls = () =>
    posts.filter((post) => post.path.endsWith('/media_publish'));
  return { createCalls, http, publishCalls, service };
}

describe('InstagramPublishingService AI label', () => {
  it('labels a single image only when asked', async () => {
    const labelled = createGraphDouble();
    await labelled.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      true,
    );
    const plain = createGraphDouble();
    await plain.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
    );

    expect(labelled.createCalls()[0].params.is_ai_generated).toBe(true);
    expect(plain.createCalls()[0].params).not.toHaveProperty('is_ai_generated');
  });

  it('labels a Reel only when asked', async () => {
    const labelled = createGraphDouble();
    await labelled.service.uploadReel(
      'org',
      'brand',
      'https://cdn.test/a.mp4',
      'caption',
      undefined,
      undefined,
      true,
      undefined,
      true,
    );
    const plain = createGraphDouble();
    await plain.service.uploadReel(
      'org',
      'brand',
      'https://cdn.test/a.mp4',
      'caption',
    );

    expect(labelled.createCalls()[0].params.is_ai_generated).toBe(true);
    expect(plain.createCalls()[0].params).not.toHaveProperty('is_ai_generated');
  });

  it('labels the carousel container and never a carousel child', async () => {
    const graph = createGraphDouble();
    await graph.service.uploadCarousel(
      'org',
      'brand',
      ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
      'caption',
      undefined,
      undefined,
      true,
    );

    const creates = graph.createCalls();
    const children = creates.filter(
      (call) => call.params.is_carousel_item === true,
    );
    const container = creates.filter((call) => call.params.children);

    expect(children).toHaveLength(2);
    expect(children.every((call) => !('is_ai_generated' in call.params))).toBe(
      true,
    );
    expect(container).toHaveLength(1);
    expect(container[0].params.is_ai_generated).toBe(true);
  });
});

describe('InstagramPublishingService when Instagram refuses the AI label', () => {
  it('creates the same image container again without the label and publishes it', async () => {
    const graph = createGraphDouble({ status: 400 });

    const result = await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      true,
    );

    const creates = graph.createCalls();
    expect(creates).toHaveLength(2);
    expect(creates[0].params.is_ai_generated).toBe(true);
    expect(creates[1].params).not.toHaveProperty('is_ai_generated');
    expect(creates[1].params.image_url).toBe('https://cdn.test/a.jpg');
    expect(graph.publishCalls()).toHaveLength(1);
    expect(result.mediaId).toBe('container-1');
  });

  it('does the same for a carousel container', async () => {
    const graph = createGraphDouble({ status: 400 });

    await graph.service.uploadCarousel(
      'org',
      'brand',
      ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
      'caption',
      undefined,
      undefined,
      true,
    );

    const container = graph
      .createCalls()
      .filter((call) => call.params.children);
    expect(container).toHaveLength(2);
    expect(container[1].params).not.toHaveProperty('is_ai_generated');
    expect(graph.publishCalls()).toHaveLength(1);
  });

  it('does not retry an error that is not a rejected request, and publishes nothing', async () => {
    const graph = createGraphDouble({ code: 190, status: 400 });

    await expect(
      graph.service.uploadImage(
        'org',
        'brand',
        'https://cdn.test/a.jpg',
        'caption',
        undefined,
        undefined,
        true,
      ),
    ).rejects.toBeDefined();

    expect(graph.createCalls()).toHaveLength(1);
    expect(graph.publishCalls()).toHaveLength(0);
  });

  it('does not retry a server error', async () => {
    const graph = createGraphDouble({ status: 500 });

    await expect(
      graph.service.uploadImage(
        'org',
        'brand',
        'https://cdn.test/a.jpg',
        'caption',
        undefined,
        undefined,
        true,
      ),
    ).rejects.toBeDefined();

    expect(graph.createCalls()).toHaveLength(1);
  });
});

describe('InstagramPublishingService carousel at the 20-image limit', () => {
  it('creates 20 child containers and sends their ids in order to the carousel parent', async () => {
    const graph = createGraphDouble(
      undefined,
      'is_ai_generated',
      { audio: [] },
      (createIndex) => `child-${createIndex}`,
    );
    const imageUrls = Array.from(
      { length: 20 },
      (_, index) => `https://cdn.test/${index + 1}.jpg`,
    );

    await graph.service.uploadCarousel('org', 'brand', imageUrls, 'caption');

    const creates = graph.createCalls();
    const children = creates.filter((call) => call.params.is_carousel_item);
    const parents = creates.filter((call) => call.params.children);

    expect(children.map((call) => call.params.image_url)).toEqual(imageUrls);
    expect(parents).toHaveLength(1);
    expect(parents[0].params.media_type).toBe('CAROUSEL');
    expect(parents[0].params.children).toBe(
      Array.from({ length: 20 }, (_, index) => `child-${index + 1}`).join(','),
    );
    expect(graph.publishCalls()).toHaveLength(1);
    expect(graph.publishCalls()[0].params.creation_id).toBe('child-21');
  });
});

describe('InstagramPublishingService alt text', () => {
  it('sends a single image its alt text, trimmed', async () => {
    const graph = createGraphDouble();
    await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      false,
      '  A red bicycle against a white wall  ',
    );

    expect(graph.createCalls()[0].params.alt_text).toBe(
      'A red bicycle against a white wall',
    );
  });

  it('sends nothing for blank alt text', async () => {
    const graph = createGraphDouble();
    await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      false,
      '   ',
    );

    expect(graph.createCalls()[0].params).not.toHaveProperty('alt_text');
  });

  it('cuts alt text at the 1,000 characters Instagram accepts', async () => {
    const graph = createGraphDouble();
    await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      false,
      'a'.repeat(1200),
    );

    expect(String(graph.createCalls()[0].params.alt_text)).toHaveLength(1000);
  });

  it('never splits an emoji when it cuts alt text', async () => {
    const graph = createGraphDouble();
    await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      false,
      `${'a'.repeat(999)}😀😀`,
    );

    expect(String(graph.createCalls()[0].params.alt_text)).toBe(
      `${'a'.repeat(999)}😀`,
    );
  });

  it('gives each carousel slide its own alt text and the carousel none', async () => {
    const graph = createGraphDouble();
    await graph.service.uploadCarousel(
      'org',
      'brand',
      [
        'https://cdn.test/1.jpg',
        'https://cdn.test/2.jpg',
        'https://cdn.test/3.jpg',
      ],
      'caption',
      undefined,
      undefined,
      false,
      ['First slide', undefined, 'Third slide'],
    );

    const creates = graph.createCalls();
    const slides = creates.filter((call) => call.params.is_carousel_item);
    const container = creates.filter((call) => call.params.children);

    expect(slides.map((call) => call.params.image_url)).toEqual([
      'https://cdn.test/1.jpg',
      'https://cdn.test/2.jpg',
      'https://cdn.test/3.jpg',
    ]);
    expect(slides.map((call) => call.params.alt_text)).toEqual([
      'First slide',
      undefined,
      'Third slide',
    ]);
    expect(container).toHaveLength(1);
    expect(container[0].params).not.toHaveProperty('alt_text');
  });

  it('creates a slide again without alt text when Instagram refuses it, and still publishes', async () => {
    const graph = createGraphDouble({ status: 400 }, 'alt_text');

    await graph.service.uploadCarousel(
      'org',
      'brand',
      ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
      'caption',
      undefined,
      undefined,
      false,
      ['First slide', 'Second slide'],
    );

    const slides = graph
      .createCalls()
      .filter((call) => call.params.is_carousel_item);
    expect(slides).toHaveLength(4);
    expect(slides.filter((call) => call.params.alt_text)).toHaveLength(2);
    expect(
      slides
        .filter((call) => !('alt_text' in call.params))
        .map((call) => call.params.image_url),
    ).toEqual(['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg']);
    expect(graph.publishCalls()).toHaveLength(1);
  });

  it('keeps the AI label when only the alt text is refused', async () => {
    const graph = createGraphDouble({ status: 400 }, 'alt_text');

    await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      true,
      'A red bicycle',
    );

    const creates = graph.createCalls();
    expect(creates).toHaveLength(2);
    expect(creates[1].params.is_ai_generated).toBe(true);
    expect(creates[1].params).not.toHaveProperty('alt_text');
    expect(graph.publishCalls()).toHaveLength(1);
  });

  it('sends a Reel cover, and keeps the label when only the cover is refused', async () => {
    const accepted = createGraphDouble();
    await accepted.service.uploadReel(
      'org',
      'brand',
      'https://cdn.test/a.mp4',
      'caption',
      'https://cdn.test/cover.jpg',
      undefined,
      true,
      undefined,
      true,
    );
    expect(accepted.createCalls()).toHaveLength(1);
    expect(accepted.createCalls()[0].params.cover_url).toBe(
      'https://cdn.test/cover.jpg',
    );

    const refused = createGraphDouble({ status: 400 }, 'cover_url');
    await refused.service.uploadReel(
      'org',
      'brand',
      'https://cdn.test/a.mp4',
      'caption',
      'https://cdn.test/cover.jpg',
      undefined,
      true,
      undefined,
      true,
    );
    const creates = refused.createCalls();
    expect(creates).toHaveLength(2);
    expect(creates[1].params.is_ai_generated).toBe(true);
    expect(creates[1].params).not.toHaveProperty('cover_url');
    expect(refused.publishCalls()).toHaveLength(1);
  });

  it('drops both optional fields when Instagram refuses the label too', async () => {
    const graph = createGraphDouble({ status: 400 }, 'is_ai_generated');

    await graph.service.uploadImage(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      'caption',
      undefined,
      undefined,
      true,
      'A red bicycle',
    );

    const creates = graph.createCalls();
    expect(creates).toHaveLength(3);
    expect(creates[1].params.alt_text).toBeUndefined();
    expect(creates[2].params).not.toHaveProperty('alt_text');
    expect(creates[2].params).not.toHaveProperty('is_ai_generated');
    expect(graph.publishCalls()).toHaveLength(1);
  });

  it('does not retry an authorization error, and publishes nothing', async () => {
    const graph = createGraphDouble({ code: 190, status: 400 }, 'alt_text');

    await expect(
      graph.service.uploadImage(
        'org',
        'brand',
        'https://cdn.test/a.jpg',
        'caption',
        undefined,
        undefined,
        false,
        'A red bicycle',
      ),
    ).rejects.toBeDefined();

    expect(graph.createCalls()).toHaveLength(1);
    expect(graph.publishCalls()).toHaveLength(0);
  });
});

describe('InstagramPublishingService stories', () => {
  it('creates an image story with no caption and publishes it at once', async () => {
    const graph = createGraphDouble();

    const result = await graph.service.uploadStory(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      false,
    );

    const [create] = graph.createCalls();
    expect(create.params).toMatchObject({
      image_url: 'https://cdn.test/a.jpg',
      media_type: 'STORIES',
    });
    expect(create.params).not.toHaveProperty('caption');
    expect(create.params).not.toHaveProperty('video_url');
    expect(create.params).not.toHaveProperty('is_ai_generated');
    expect(graph.publishCalls()).toHaveLength(1);
    expect(result).toEqual({ mediaId: 'container-1' });
  });

  it('creates a video story, waits for processing and labels it when asked', async () => {
    const graph = createGraphDouble();

    await graph.service.uploadStory(
      'org',
      'brand',
      'https://cdn.test/a.mp4',
      true,
      undefined,
      true,
    );

    const [create] = graph.createCalls();
    expect(create.params).toMatchObject({
      is_ai_generated: true,
      media_type: 'STORIES',
      video_url: 'https://cdn.test/a.mp4',
    });
    expect(create.params).not.toHaveProperty('image_url');
    expect(graph.publishCalls()).toHaveLength(1);
  });

  it('retries a story without the AI label when Instagram refuses it', async () => {
    const graph = createGraphDouble({ status: 400 });

    const result = await graph.service.uploadStory(
      'org',
      'brand',
      'https://cdn.test/a.jpg',
      false,
      undefined,
      true,
    );

    const creates = graph.createCalls();
    expect(creates).toHaveLength(2);
    expect(creates[1].params).not.toHaveProperty('is_ai_generated');
    expect(graph.publishCalls()).toHaveLength(1);
    expect(result.mediaId).toBe('container-1');
  });
});

describe('InstagramPublishingService Reel music', () => {
  const reel = (
    graph: ReturnType<typeof createGraphDouble>,
    audio?: { audio_id: string; audio_volume?: number; video_volume?: number },
  ) =>
    graph.service.uploadReel(
      'org',
      'brand',
      'https://cdn.test/a.mp4',
      'caption',
      undefined,
      undefined,
      true,
      undefined,
      true,
      audio,
    );

  it('sends the track as an audio_configuration JSON string', async () => {
    const graph = createGraphDouble();
    await reel(graph, {
      audio_id: ' 1234 ',
      audio_volume: 80,
      video_volume: 10,
    });

    expect(graph.createCalls()[0].params.audio_configuration).toBe(
      JSON.stringify({ audio_id: '1234', audio_volume: 80, video_volume: 10 }),
    );
  });

  it('sends no audio_configuration without a track', async () => {
    const graph = createGraphDouble();
    await reel(graph);

    expect(graph.createCalls()[0].params).not.toHaveProperty(
      'audio_configuration',
    );
  });

  it('keeps the track when only another optional field is refused', async () => {
    const graph = createGraphDouble({ status: 400 }, 'is_ai_generated');
    await reel(graph, { audio_id: '1234' });

    const creates = graph.createCalls();
    expect(creates.length).toBeGreaterThan(1);
    for (const create of creates) {
      expect(create.params.audio_configuration).toBe(
        JSON.stringify({ audio_id: '1234' }),
      );
    }
    expect(graph.publishCalls()).toHaveLength(1);
  });

  it('fails instead of publishing a silent Reel when the track is refused', async () => {
    const graph = createGraphDouble({ status: 400 }, 'audio_configuration');

    await expect(reel(graph, { audio_id: '1234' })).rejects.toBeDefined();
    expect(graph.publishCalls()).toHaveLength(0);
  });
});

describe('InstagramPublishingService listAudio', () => {
  it('reads ig_audio with the account id and maps the tracks', async () => {
    const graph = createGraphDouble(undefined, 'is_ai_generated', {
      audio: [
        {
          audio_id: '1234',
          audio_type: 'music',
          cover_artwork_thumbnail_uri: 'https://cdn.test/art.jpg',
          display_artist: 'Artist',
          duration_in_ms: 30000,
          is_ads_eligible: true,
          on_platform_audio_preview_link: 'https://cdn.test/p.mp3',
          title: 'Track',
        },
        { title: 'no id, skipped' },
      ],
    });

    const tracks = await graph.service.listAudio(
      'org',
      'brand',
      'music',
      ' lofi ',
    );

    expect(graph.http.get).toHaveBeenCalledWith(
      'https://graph.test/v1/ig_audio',
      {
        params: {
          access_token: 'token',
          audio_type: 'music',
          search_query: 'lofi',
          user_id: 'ig-1',
        },
      },
    );
    expect(tracks).toEqual([
      expect.objectContaining({
        artist: 'Artist',
        audioType: 'music',
        durationMs: 30000,
        id: '1234',
        title: 'Track',
      }),
    ]);
  });

  it('lists trending audio when there is no search text', async () => {
    const graph = createGraphDouble();
    await graph.service.listAudio('org', 'brand', 'original_sound');

    const params = graph.http.get.mock.calls[0][1]?.params;
    expect(params).not.toHaveProperty('search_query');
    expect(params?.audio_type).toBe('original_sound');
  });
});
