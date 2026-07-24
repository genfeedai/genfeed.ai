import { createConfigModule } from '@libs/config/create-config-module';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

let constructionCount = 0;

@Injectable()
class FakeConfigService {
  constructor() {
    constructionCount += 1;
  }

  get(key: string): string {
    return `value:${key}`;
  }
}

@Injectable()
class FakeValidationService {}

// Deliberately a value import of `FakeConfigService` in the constructor
// signature — `import type` here would erase the `design:paramtypes` entry and
// Nest would inject `undefined`. See
// `.agents/memory/rules/nestjs_value_imports_for_di.md`.
@Injectable()
class ConsumerService {
  constructor(readonly config: FakeConfigService) {}
}

@Module({ exports: [ConsumerService], providers: [ConsumerService] })
class ConsumerModule {}

describe('createConfigModule', () => {
  beforeEach(() => {
    constructionCount = 0;
  });

  it('provides the config service as a single eagerly-built instance', async () => {
    const ConfigModule = createConfigModule({
      configService: FakeConfigService,
    });

    // `useValue: new ConfigService()` — the instance exists before Nest ever
    // resolves it, so config validation fails at module creation rather than on
    // first injection.
    expect(constructionCount).toBe(1);

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();

    const service = moduleRef.get(FakeConfigService);
    expect(service).toBeInstanceOf(FakeConfigService);
    expect(service.get('PORT')).toBe('value:PORT');
    expect(constructionCount).toBe(1);
  });

  it('is global — consumers inject the config service without importing it', async () => {
    const ConfigModule = createConfigModule({
      configService: FakeConfigService,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, ConsumerModule],
    }).compile();

    const consumer = moduleRef.get(ConsumerService);
    expect(consumer.config).toBeInstanceOf(FakeConfigService);
    expect(consumer.config).toBe(moduleRef.get(FakeConfigService));
  });

  it('defers construction until DI resolution when isLazy is set', async () => {
    const ConfigModule = createConfigModule({
      configService: FakeConfigService,
      isLazy: true,
    });

    // The API tier's contract: importing the module must not construct the
    // config service, so a spec can import a module graph without a fully
    // populated environment. Regression guard — the eager default broke 86 API
    // unit specs at import time.
    expect(constructionCount).toBe(0);

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();

    // Still fail-fast at boot: compiling the module resolves the provider.
    expect(constructionCount).toBe(1);
    expect(moduleRef.get(FakeConfigService)).toBeInstanceOf(FakeConfigService);
  });

  it('throws at compile time, not import time, when lazy construction fails', async () => {
    class ThrowingConfigService {
      constructor() {
        throw new Error('Config validation error: "PORT" is required');
      }
    }

    const ConfigModule = createConfigModule({
      configService: ThrowingConfigService,
      isLazy: true,
    });

    await expect(
      Test.createTestingModule({ imports: [ConfigModule] }).compile(),
    ).rejects.toThrow(/"PORT" is required/);
  });

  it('registers and exports additional providers', async () => {
    const ConfigModule = createConfigModule({
      configService: FakeConfigService,
      providers: [FakeValidationService],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();

    expect(moduleRef.get(FakeValidationService)).toBeInstanceOf(
      FakeValidationService,
    );
  });
});
