import { MODULE_METADATA } from '@nestjs/common/constants';
import { GenerationServicesModule } from '@workers/services/generation-services.module';

describe('GenerationServicesModule', () => {
  it('only exports services it provides', () => {
    const exported =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, GenerationServicesModule) ??
      [];
    const providers =
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        GenerationServicesModule,
      ) ?? [];

    expect(exported).not.toEqual([]);
    expect(
      exported.every((service: unknown) => providers.includes(service)),
    ).toBe(true);
  });
});
