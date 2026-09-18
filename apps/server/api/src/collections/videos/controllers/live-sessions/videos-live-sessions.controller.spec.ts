import { readFileSync } from 'node:fs';
import { VideosLiveSessionsController } from '@api/collections/videos/controllers/live-sessions/videos-live-sessions.controller';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ActivitySource } from '@genfeedai/contracts';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => data),
}));

describe('VideosLiveSessionsController', () => {
  it('reserves live-session credits on the guarded API path before connect', () => {
    const handler = VideosLiveSessionsController.prototype.openSession;

    expect(Reflect.getMetadata(CREDITS_KEY, handler)).toEqual({
      description: 'Live session',
      source: ActivitySource.VIDEO_GENERATION,
    });
    expect(
      Reflect.getMetadata(CREDITS_DEFER_MODEL_RESOLUTION_KEY, handler),
    ).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      SubscriptionGuard,
      CreditsGuard,
      ModelsGuard,
    ]);
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toEqual([
      CreditsInterceptor,
    ]);
  });

  it('does not re-reserve credits when terminating a session', () => {
    const handler = VideosLiveSessionsController.prototype.terminateSession;

    expect(Reflect.getMetadata(CREDITS_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toBeUndefined();
  });

  it('does not import a provider client on the reservation path', () => {
    const controllerSource = readFileSync(
      new URL('./videos-live-sessions.controller.ts', import.meta.url),
      'utf8',
    );
    const serviceSource = readFileSync(
      new URL(
        '../../services/live-session-credits.service.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(controllerSource).not.toMatch(/FalService|@fal-ai\/client/);
    expect(serviceSource).not.toMatch(/FalService|@fal-ai\/client/);
  });
});
