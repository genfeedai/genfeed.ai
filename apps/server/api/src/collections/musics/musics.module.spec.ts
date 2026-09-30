import { MusicsModule } from '@api/collections/musics/musics.module';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import { WebhooksMediaModule } from '@api/endpoints/webhooks/webhooks-media.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('MusicsModule', () => {
  it('should be defined', () => {
    expect(MusicsModule).toBeDefined();
  });

  it('registers the music generation orchestration service', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MusicsModule) ?? [];

    expect(providers).toContain(MusicGenerationService);
  });

  it('imports the webhook media leaf statically instead of resolving it at runtime', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, MusicsModule) ?? [];

    expect(imports).toContain(WebhooksMediaModule);
  });
});
