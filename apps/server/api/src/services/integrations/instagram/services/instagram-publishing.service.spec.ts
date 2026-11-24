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
 * `refuseLabel` makes Instagram answer a create call that carries the AI label
 * with the given HTTP status, as it would for a parameter it does not accept.
 */
function createGraphDouble(refuseLabel?: { status: number; code?: number }) {
  const posts: GraphPost[] = [];
  const http = {
    get: vi.fn((url: string) =>
      of({
        data: url.endsWith('/container-1')
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
        if (refuseLabel && config.params.is_ai_generated) {
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
  return { createCalls, publishCalls, service };
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
