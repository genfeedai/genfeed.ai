vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, value) => ({ data: value })),
}));

import type { BrandOsPreviewService } from '@api/collections/brands/services/brand-os-preview.service';
import { PublicBrandOsController } from '@api/endpoints/public/controllers/brand-os/public.brand-os.controller';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { BrandOsPreviewSerializer } from '@genfeedai/serializers';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

describe('PublicBrandOsController', () => {
  const request = { originalUrl: '/public/brand-os/preview' } as Request;
  const preview = {
    draft: {
      assetCandidates: [],
      brandId: 'preview-1',
      diagnostics: [],
      evidence: [],
      fields: {},
      id: 'preview-1',
      readiness: {
        diagnostics: [],
        missingFields: [],
        requiredFields: [],
        score: 100,
        status: 'complete',
      },
      sourceType: 'manual',
      status: 'ready',
    },
    expiresAt: '2026-08-26T12:30:00.000Z',
    id: 'preview-1',
    previewToken: 'a'.repeat(43),
  } as const;

  it('serializes a real preview through the public Brand OS contract', async () => {
    const service = { createPreview: vi.fn().mockResolvedValue(preview) };
    const controller = new PublicBrandOsController(
      service as unknown as BrandOsPreviewService,
    );

    await expect(
      controller.preview(request, { guidance: 'Proof-led guidance.' }),
    ).resolves.toEqual({ data: preview });
    expect(service.createPreview).toHaveBeenCalledWith({
      guidance: 'Proof-led guidance.',
    });
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      BrandOsPreviewSerializer,
      preview,
    );
  });

  it('is public, IP-limited, and explicitly non-cacheable', () => {
    const handler = PublicBrandOsController.prototype.preview;
    const rateLimit = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      handler,
    ) as RateLimitOptions;
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as Array<{
      name: string;
      value: string;
    }>;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(rateLimit).toEqual({ limit: 5, scope: 'ip', windowMs: 60_000 });
    expect(headers).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'no-store' },
        { name: 'Pragma', value: 'no-cache' },
      ]),
    );
  });
});
