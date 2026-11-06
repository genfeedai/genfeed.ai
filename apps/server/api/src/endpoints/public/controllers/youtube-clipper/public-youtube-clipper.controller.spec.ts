import { PublicYoutubeClipperController } from '@api/endpoints/public/controllers/youtube-clipper/public-youtube-clipper.controller';
import type { PublicYoutubeClipperService } from '@api/endpoints/public/services/public-youtube-clipper.service';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import type { Request } from 'express';

type Service = PublicYoutubeClipperService;
type Session = Awaited<ReturnType<Service['read']>>;

const request = { originalUrl: '/public/youtube-clipper' } as Request;
const TOKEN = 'a'.repeat(43);

/**
 * The public clipper over an in-memory session store. A session is reachable
 * only by its opaque preview token; creating one with a used idempotency key
 * returns the same session; a preview request marks the chosen moment.
 */
function clipper() {
  const sessions = new Map<string, Session>();
  const byKey = new Map<string, string>();
  const service = {
    create: async (youtubeUrl: string, idempotencyKey?: string) => {
      const existing = idempotencyKey && byKey.get(idempotencyKey);
      if (existing) {
        return sessions.get(existing) as Session;
      }
      const token = sessions.size === 0 ? TOKEN : `${TOKEN}-${sessions.size}`;
      const session = {
        expiresAt: '2026-08-26T12:00:00.000Z',
        id: `session-${sessions.size + 1}`,
        preview: { status: 'available' },
        previewToken: token,
        progress: 0,
        recommendations: [],
        sourceUrl: youtubeUrl,
        status: 'queued',
        transcript: [],
      } as unknown as Session;
      sessions.set(token, session);
      if (idempotencyKey) {
        byKey.set(idempotencyKey, token);
      }
      return session;
    },
    read: async (token: string) => {
      const session = sessions.get(token);
      if (!session) {
        throw new Error('not found');
      }
      return session;
    },
    requestPreview: async (token: string, recommendationId: string) => {
      const session = await service.read(token);
      const updated = {
        ...session,
        preview: { recommendationId, status: 'queued' },
      } as unknown as Session;
      sessions.set(token, updated);
      return updated;
    },
  };
  return new PublicYoutubeClipperController(service as unknown as Service);
}

describe('PublicYoutubeClipperController', () => {
  it('creates a session, reads it back by its token and queues a preview', async () => {
    const controller = clipper();

    const created = await controller.create(request, 'request-key-1', {
      youtubeUrl: 'https://youtu.be/abc12345',
    });
    const replayed = await controller.create(request, 'request-key-1', {
      youtubeUrl: 'https://youtu.be/abc12345',
    });
    const read = await controller.read(request, TOKEN);
    const previewed = await controller.preview(request, TOKEN, {
      recommendationId: 'moment-1',
    });

    expect(created.data).toMatchObject({
      attributes: { previewToken: TOKEN, status: 'queued' },
      id: 'session-1',
    });
    expect(replayed.data).toEqual(created.data);
    expect(read.data).toEqual(created.data);
    expect(previewed.data).toMatchObject({
      attributes: {
        preview: { recommendationId: 'moment-1', status: 'queued' },
      },
      id: 'session-1',
    });
  });

  it('cannot read a session without its token', async () => {
    const controller = clipper();
    await controller.create(request, undefined, {
      youtubeUrl: 'https://youtu.be/abc12345',
    });

    await expect(controller.read(request, 'b'.repeat(43))).rejects.toThrow(
      'not found',
    );
  });

  it.each([
    ['create', PublicYoutubeClipperController.prototype.create, 3, 3_600_000],
    ['read', PublicYoutubeClipperController.prototype.read, 60, 60_000],
    ['preview', PublicYoutubeClipperController.prototype.preview, 1, 3_600_000],
  ] as const)(
    'keeps %s public and IP-limited',
    (_name, handler, limit, windowMs) => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toEqual({
        limit,
        scope: 'ip',
        windowMs,
      } satisfies RateLimitOptions);
    },
  );
});
