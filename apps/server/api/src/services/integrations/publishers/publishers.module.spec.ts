import { SERVER_TOKENS } from '@api/index';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { PublishersModule } from '@api/services/integrations/publishers/publishers.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('PublishersModule', () => {
  it('should be defined', () => {
    expect(PublishersModule).toBeDefined();
  });

  it('binds and exports the canonical publisher factory port', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PublishersModule) ?? [];
    const exports =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, PublishersModule) ?? [];
    const factoryProvider = {
      provide: SERVER_TOKENS.publisherFactory,
      useExisting: PublisherFactoryService,
    };

    expect(providers).toContain(PublisherFactoryService);
    expect(providers).toContainEqual(factoryProvider);
    expect(exports).toContain(PublisherFactoryService);
    expect(exports).toContainEqual(factoryProvider);
  });
});
