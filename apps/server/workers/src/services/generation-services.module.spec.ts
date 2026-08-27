import { MODULE_METADATA } from '@nestjs/common/constants';
import { GenerationServicesModule } from '@workers/services/generation-services.module';

describe('GenerationServicesModule', () => {
  it('keeps domain services owned by WorkersDomainModule', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, GenerationServicesModule) ??
        [],
    ).toEqual([]);
  });
});
