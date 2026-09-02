import { ImagesModule } from '@api/collections/images/images.module';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('ImagesModule', () => {
  it('should be defined', () => {
    expect(ImagesModule).toBeDefined();
  });

  it('constructs the framework-agnostic Higgsfield adapter with its integration service', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ImagesModule) ?? [];

    expect(providers).toContainEqual(
      expect.objectContaining({
        inject: [HiggsFieldService],
        provide: HiggsFieldImageGenerationProviderAdapter,
        useFactory: expect.any(Function),
      }),
    );
    expect(providers).not.toContain(HiggsFieldImageGenerationProviderAdapter);
  });
});
