import { WebhooksModule } from '@api/endpoints/webhooks/webhooks.module';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { WebhooksMediaModule } from '@api/endpoints/webhooks/webhooks-media.module';
import { MODULE_METADATA } from '@nestjs/common/constants';

function moduleMetadata(target: object, key: string): unknown[] {
  return Reflect.getMetadata(key, target) ?? [];
}

function moduleNames(target: object, key: string): string[] {
  return moduleMetadata(target, key).map((entry) =>
    typeof entry === 'function' ? entry.name : String(entry),
  );
}

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

  it('re-exports the media leaf from the hub for unmigrated callers', () => {
    const imports = moduleMetadata(WebhooksCoreModule, MODULE_METADATA.IMPORTS);
    const exports = moduleMetadata(WebhooksCoreModule, MODULE_METADATA.EXPORTS);
    const providers = moduleMetadata(
      WebhooksCoreModule,
      MODULE_METADATA.PROVIDERS,
    );

    expect(imports).toContain(WebhooksMediaModule);
    expect(exports).toContain(WebhooksMediaModule);
    expect(providers).not.toContain(WebhooksService);
  });
});

describe('WebhooksMediaModule', () => {
  it('provides and exports the media-processing entry point', () => {
    const providers = moduleMetadata(
      WebhooksMediaModule,
      MODULE_METADATA.PROVIDERS,
    );
    const exports = moduleMetadata(
      WebhooksMediaModule,
      MODULE_METADATA.EXPORTS,
    );

    expect(providers).toContain(WebhooksService);
    expect(exports).toContain(WebhooksService);
  });

  it('stays a leaf: never imports Brands, Workflows, Content Engine or the bot gateway hub', () => {
    const imports = moduleNames(WebhooksMediaModule, MODULE_METADATA.IMPORTS);

    expect(imports).not.toContain('BrandsModule');
    expect(imports).not.toContain('BrandsCoreModule');
    expect(imports).not.toContain('WorkflowsModule');
    expect(imports).not.toContain('ContentEngineModule');
    expect(imports).not.toContain('BotGatewayModule');
    expect(imports).not.toContain('WebhooksCoreModule');
  });
});
