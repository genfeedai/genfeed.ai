import type { LoggerService } from '@libs/logger/logger.service';
import { InProcessRedisService } from '@libs/redis/in-process-redis.service';
import { RedisModule } from '@libs/redis/redis.module';
import { RedisService } from '@libs/redis/redis.service';
import type { FactoryProvider } from '@nestjs/common';
import { describe, expect, it, type Mocked, vi } from 'vitest';

class TestConfigModule {}
class TestConfigService {}

const mockLoggerService: Mocked<
  Pick<LoggerService, 'debug' | 'error' | 'log' | 'warn'>
> = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

function getRedisFactory(): FactoryProvider<RedisService> {
  const dynamicModule = RedisModule.forRoot({
    configModule: TestConfigModule,
    configService: TestConfigService,
  });
  const provider = dynamicModule.providers?.find(
    (candidate): candidate is FactoryProvider<RedisService> =>
      typeof candidate === 'object' &&
      'provide' in candidate &&
      candidate.provide === RedisService,
  );
  if (!provider) {
    throw new Error('RedisService factory provider not registered');
  }
  return provider;
}

describe('RedisModule.forRoot', () => {
  it('builds a global module exporting RedisService and the config token', () => {
    const dynamicModule = RedisModule.forRoot({
      configModule: TestConfigModule,
      configService: TestConfigService,
    });

    expect(dynamicModule.module).toBe(RedisModule);
    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.exports).toEqual([RedisService, 'ConfigService']);
    expect(dynamicModule.imports).toContain(TestConfigModule);
    expect(dynamicModule.providers).toContainEqual({
      provide: 'ConfigService',
      useExisting: TestConfigService,
    });
  });

  it('instantiates the network driver by default', () => {
    const factory = getRedisFactory();
    const configService = {
      get: vi.fn<(key: string) => string | undefined>(() => undefined),
    };

    const service = factory.useFactory(
      configService,
      mockLoggerService as unknown as LoggerService,
    );

    expect(service).toBeInstanceOf(RedisService);
    expect(service).not.toBeInstanceOf(InProcessRedisService);
  });

  it('instantiates the in-process driver when configured', () => {
    const factory = getRedisFactory();
    const configService = {
      get: vi.fn<(key: string) => string | undefined>((key) =>
        key === 'REDIS_DRIVER' ? 'in-process' : undefined,
      ),
    };

    const service = factory.useFactory(
      configService,
      mockLoggerService as unknown as LoggerService,
    );

    expect(service).toBeInstanceOf(InProcessRedisService);
  });
});
