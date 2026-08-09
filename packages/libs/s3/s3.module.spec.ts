import { S3Module } from '@libs/s3/s3.module';
import { S3Service } from '@libs/s3/s3.service';
import { describe, expect, it } from 'vitest';

class TestConfigModule {}
class TestConfigService {}

describe('S3Module.forRoot', () => {
  it('builds a global module wiring the app config service', () => {
    const dynamicModule = S3Module.forRoot({
      configModule: TestConfigModule,
      configService: TestConfigService,
    });

    expect(dynamicModule.module).toBe(S3Module);
    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.exports).toEqual([S3Service]);
    expect(dynamicModule.imports).toContain(TestConfigModule);
    expect(dynamicModule.providers).toContainEqual(S3Service);
    expect(dynamicModule.providers).toContainEqual({
      provide: 'ConfigService',
      useExisting: TestConfigService,
    });
  });
});
