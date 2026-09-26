import type { DynamicModule, Provider } from '@nestjs/common';
import {
  MODULE_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import { PlatformSchedulesModule } from '@workers/scheduling/platform-schedules.module';

const QUEUE_TOKEN_PREFIX = 'BullQueue_';

function providerToken(provider: Provider): unknown {
  return typeof provider === 'function' ? provider : provider.provide;
}

describe('PlatformSchedulesModule', () => {
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
