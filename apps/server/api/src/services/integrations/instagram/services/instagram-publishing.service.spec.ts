import { InstagramPublishingService } from '@api/services/integrations/instagram/services/instagram-publishing.service';
import type { InstagramCredentialResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

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

/** An HTTP double that records every Graph API create call and answers like it. */
function createGraphDouble() {
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
        return of({ data: { id: 'container-1' } });
      },
    ),
  };
  const service = new InstagramPublishingService(
    http as unknown as HttpService,
    { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
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
  return { createCalls, service };
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
