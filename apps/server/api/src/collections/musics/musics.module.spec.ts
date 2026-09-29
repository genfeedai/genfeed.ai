import { MusicsModule } from '@api/collections/musics/musics.module';
import { WebhooksMediaModule } from '@api/endpoints/webhooks/webhooks-media.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('MusicsModule', () => {
  it('imports the webhook media leaf statically instead of resolving it at runtime', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, MusicsModule) ?? [];

    expect(imports).toContain(WebhooksMediaModule);
  });
});
