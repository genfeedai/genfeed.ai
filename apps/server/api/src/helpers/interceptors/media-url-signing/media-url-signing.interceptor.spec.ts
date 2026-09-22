import { MediaUrlSigningInterceptor } from '@api/helpers/interceptors/media-url-signing/media-url-signing.interceptor';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';

const CDN = 'https://cdn.genfeed.ai';

function buildInterceptor(isCdnSigningEnabled: boolean) {
  const mediaUrlService = {
    buildUrlFromAbsolute: vi.fn((url: string) => `${url}?Signature=signed`),
  };
  const configService = { cdnUrl: CDN, isCdnSigningEnabled };
  const interceptor = new MediaUrlSigningInterceptor(
    configService as never,
    mediaUrlService as never,
  );
  return { interceptor, mediaUrlService };
}

async function run(
  interceptor: MediaUrlSigningInterceptor,
  body: unknown,
): Promise<unknown> {
  const next: CallHandler = { handle: () => of(body) };
  return firstValueFrom(interceptor.intercept({} as ExecutionContext, next));
}

describe('MediaUrlSigningInterceptor', () => {
  it('passes the response through untouched when signing is disabled', async () => {
    const { interceptor, mediaUrlService } = buildInterceptor(false);
    const body = { data: { attributes: { cdnUrl: `${CDN}/a.png` } } };

    await expect(run(interceptor, body)).resolves.toBe(body);
    expect(mediaUrlService.buildUrlFromAbsolute).not.toHaveBeenCalled();
  });

  it('signs CDN URLs anywhere in a JSON:API document', async () => {
    const { interceptor } = buildInterceptor(true);
    const body = {
      data: [
        {
          attributes: {
            cdnUrl: `${CDN}/ingredients/images/a.png`,
            metadata: { thumbnailUrl: `${CDN}/ingredients/thumbnails/a.jpg` },
          },
          id: 'a',
        },
      ],
      included: [{ attributes: { cdnUrl: `${CDN}/ingredients/videos/b.mp4` } }],
    };

    await expect(run(interceptor, body)).resolves.toEqual({
      data: [
        {
          attributes: {
            cdnUrl: `${CDN}/ingredients/images/a.png?Signature=signed`,
            metadata: {
              thumbnailUrl: `${CDN}/ingredients/thumbnails/a.jpg?Signature=signed`,
            },
          },
          id: 'a',
        },
      ],
      included: [
        {
          attributes: {
            cdnUrl: `${CDN}/ingredients/videos/b.mp4?Signature=signed`,
          },
        },
      ],
    });
  });

  it('leaves URLs on other origins and ordinary strings alone', async () => {
    const { interceptor, mediaUrlService } = buildInterceptor(true);
    const body = {
      label: 'A red apple',
      providerUrl: 'https://replicate.delivery/output/a.png',
      // Same host prefix without the path separator must not match.
      lookalike: 'https://cdn.genfeed.ai.evil.example/a.png',
    };

    await expect(run(interceptor, body)).resolves.toEqual(body);
    expect(mediaUrlService.buildUrlFromAbsolute).not.toHaveBeenCalled();
  });

  it('never mutates the original body, which a cache may be holding', async () => {
    const { interceptor } = buildInterceptor(true);
    const body = { data: { attributes: { cdnUrl: `${CDN}/a.png` } } };

    await run(interceptor, body);

    expect(body.data.attributes.cdnUrl).toBe(`${CDN}/a.png`);
  });

  it('passes non-plain values through untouched', async () => {
    const { interceptor } = buildInterceptor(true);
    const buffer = Buffer.from('bytes');
    const date = new Date('2026-09-22T00:00:00.000Z');

    await expect(run(interceptor, buffer)).resolves.toBe(buffer);
    await expect(run(interceptor, { createdAt: date })).resolves.toEqual({
      createdAt: date,
    });
    await expect(run(interceptor, null)).resolves.toBeNull();
    await expect(run(interceptor, 42)).resolves.toBe(42);
  });
});
