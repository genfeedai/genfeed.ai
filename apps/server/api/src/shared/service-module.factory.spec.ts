import {
  createCachedServiceModule,
  createServiceModule,
} from '@api/shared/service-module.factory';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { CacheModule } from '@nestjs/cache-manager';
import { describe, expect, it } from 'vitest';

class ExampleService {}

describe('createServiceModule', () => {
  it('rejects a missing service class and invalid extra tokens', () => {
    expect(() =>
      createServiceModule(null as unknown as typeof ExampleService),
    ).toThrow(/undefined or null ServiceClass/);

    expect(() =>
      createServiceModule(ExampleService, {
        additionalImports: [undefined as never],
      }),
    ).toThrow(/additionalImports/);

    expect(() =>
      createServiceModule(ExampleService, {
        additionalProviders: [undefined as never],
      }),
    ).toThrow(/additionalProviders/);

    expect(() =>
      createServiceModule(ExampleService, {
        additionalExports: [undefined as never],
      }),
    ).toThrow(/exports array/);
  });

  it('wires ConfigModule, LoggerModule, and the service as a dynamic module', () => {
    const module = createServiceModule(ExampleService, {
      additionalExports: ['TOKEN'],
      additionalImports: [CacheModule],
      additionalProviders: [{ provide: 'TOKEN', useValue: 1 }],
      isGlobal: true,
    });

    expect(module.global).toBe(true);
    expect(module.imports).toEqual(
      expect.arrayContaining([ConfigModule, LoggerModule, CacheModule]),
    );
    expect(module.providers).toEqual(
      expect.arrayContaining([
        ExampleService,
        { provide: 'TOKEN', useValue: 1 },
      ]),
    );
    expect(module.exports).toEqual(
      expect.arrayContaining([ExampleService, 'TOKEN']),
    );
  });
});

describe('createCachedServiceModule', () => {
  it('registers CacheModule alongside ConfigModule and LoggerModule', () => {
    const module = createCachedServiceModule(ExampleService);

    expect(module.imports).toEqual(
      expect.arrayContaining([
        ConfigModule,
        LoggerModule,
        expect.objectContaining({ module: CacheModule }),
      ]),
    );
    expect(module.providers).toEqual(expect.arrayContaining([ExampleService]));
  });
});
