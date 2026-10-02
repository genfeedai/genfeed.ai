vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3013';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import { CrunModule } from '@api/services/integrations/crun/crun.module';
import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { VideoCompletionCoreModule } from '@api/services/video-completion/video-completion-core.module';
import type { DynamicModule, Provider } from '@nestjs/common';
import {
  MODULE_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import { PlatformMediaSchedulesService } from '@workers/scheduling/platform-media-schedules.service';
import { PlatformSchedulesModule } from '@workers/scheduling/platform-schedules.module';
import { CrunReconcileService } from '@workers/services/crun-reconcile.service';

const QUEUE_TOKEN_PREFIX = 'BullQueue_';

function providerToken(provider: Provider): unknown {
  return typeof provider === 'function' ? provider : provider.provide;
}

describe('PlatformSchedulesModule', () => {
  it('resolves the concrete media facade through the existing actual owners', () => {
    const providers: Provider[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PlatformSchedulesModule) ??
      [];
    expect(
      providers
        .map(providerToken)
        .filter((token) => token === PlatformMediaSchedulesService),
    ).toHaveLength(1);
    expect(providers.map(providerToken)).toContain(CrunReconcileService);
    const imports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PlatformSchedulesModule) ??
      [];
    expect(imports).toContain(CrunModule);
    expect(imports).toContain(VideoCompletionCoreModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, VideoCompletionCoreModule),
    ).toContain(VideoCompletionService);
  });
  it('registers every BullMQ queue its providers inject', () => {
    const imports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PlatformSchedulesModule) ??
      [];
    const registeredQueues = new Set(
      imports
        .filter(
          (entry): entry is DynamicModule =>
            typeof entry === 'object' && entry !== null && 'module' in entry,
        )
        .flatMap((entry) => entry.providers ?? [])
        .map(providerToken)
        .filter(
          (token): token is string =>
            typeof token === 'string' && token.startsWith(QUEUE_TOKEN_PREFIX),
        ),
    );
    const providers: Provider[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PlatformSchedulesModule) ??
      [];
    const injectedQueues = providers
      .filter((provider) => typeof provider === 'function')
      .flatMap(
        (provider) =>
          (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, provider) ??
            []) as Array<{ param: unknown }>,
      )
      .map(({ param }) => param)
      .filter(
        (token): token is string =>
          typeof token === 'string' && token.startsWith(QUEUE_TOKEN_PREFIX),
      );

    expect(injectedQueues).toContain('BullQueue_workflow-execution');
    for (const token of injectedQueues) {
      expect(registeredQueues).toContain(token);
    }
  });
});
