vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, value) => ({ data: value })),
}));

import { PublicYoutubeClipperController } from '@api/endpoints/public/controllers/youtube-clipper/public-youtube-clipper.controller';
import type { PublicYoutubeClipperService } from '@api/endpoints/public/services/public-youtube-clipper.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { PublicYoutubeClipperToolSerializer } from '@genfeedai/serializers';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import type { Request } from 'express';

describe('PublicYoutubeClipperController', () => {
  const request = { originalUrl: '/public/youtube-clipper' } as Request;
  const session = {
    expiresAt: '2026-08-26T12:00:00.000Z',
    id: 'session-1',
    preview: { status: 'available' },
    previewToken: 'a'.repeat(43),
    progress: 0,
    recommendations: [],
    status: 'queued',
    transcript: [],
  } as const;

  it('creates, reads, and requests a preview through opaque path capabilities', async () => {
    const service = {
      create: vi.fn().mockResolvedValue(session),
      read: vi.fn().mockResolvedValue(session),
      requestPreview: vi.fn().mockResolvedValue(session),
    };
    const controller = new PublicYoutubeClipperController(
      service as unknown as PublicYoutubeClipperService,
    );

    await controller.create(request, 'request-key-1', {
      youtubeUrl: 'https://youtu.be/abc12345',
    });
    await controller.read(request, session.previewToken);
    await controller.preview(request, session.previewToken, {
      recommendationId: 'moment-1',
    });

    expect(service.create).toHaveBeenCalledWith(
      'https://youtu.be/abc12345',
      'request-key-1',
    );
    expect(service.read).toHaveBeenCalledWith(session.previewToken);
    expect(service.requestPreview).toHaveBeenCalledWith(
      session.previewToken,
      'moment-1',
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      PublicYoutubeClipperToolSerializer,
      session,
    );
  });

  it('keeps each public action IP-limited', () => {
    const cases = [
      [PublicYoutubeClipperController.prototype.create, 3, 3_600_000],
      [PublicYoutubeClipperController.prototype.read, 60, 60_000],
      [PublicYoutubeClipperController.prototype.preview, 1, 3_600_000],
    ] as const;

    for (const [handler, limit, windowMs] of cases) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toEqual({
        limit,
        scope: 'ip',
        windowMs,
      } satisfies RateLimitOptions);
    }
  });
});
