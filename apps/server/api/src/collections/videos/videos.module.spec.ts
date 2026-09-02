import { HiggsFieldVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/higgsfield-video-generation-provider.adapter';
import { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import { VideosModule } from '@api/collections/videos/videos.module';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('VideosModule', () => {
  it('should be defined', () => {
    expect(VideosModule).toBeDefined();
  });

  it('registers video merge orchestration', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VideosModule) ?? [];

    expect(providers).toContain(VideoMergeOrchestrationService);
  });

  it('constructs the framework-agnostic Higgsfield adapter with its integration service', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VideosModule) ?? [];

    expect(providers).toContainEqual(
      expect.objectContaining({
        inject: [HiggsFieldService],
        provide: HiggsFieldVideoGenerationProviderAdapter,
        useFactory: expect.any(Function),
      }),
    );
    expect(providers).not.toContain(HiggsFieldVideoGenerationProviderAdapter);
  });
});
