import { MusicsModule } from '@api/collections/musics/musics.module';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
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
});
