import { WebhooksModule } from '@api/endpoints/webhooks/webhooks.module';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('WebhooksModule', () => {
  it('should be defined', () => {
    expect(WebhooksModule).toBeDefined();
  });

  it('does not mount HTTP controllers on the worker-safe core', () => {
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WebhooksCoreModule) ??
      [];
    expect(controllers).toEqual([]);
  });
});
