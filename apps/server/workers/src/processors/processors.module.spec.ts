vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3013';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import { ContentRunsModule } from '@api/collections/content-runs/content-runs.module';
import { BrandRemixSceneWorkflowService } from '@api/collections/content-runs/services/brand-remix-scene-workflow.service';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ProcessorsModule } from '@workers/processors/processors.module';

function unwrap(value: unknown): unknown {
  if (typeof value === 'function' && 'forwardRef' in value) {
    const forwarded = (value as { forwardRef?: unknown }).forwardRef;
    if (typeof forwarded === 'function' && forwarded !== value) {
      return forwarded();
    }
    return (value as unknown as () => unknown)();
  }
  if (
    value &&
    typeof value === 'object' &&
    'forwardRef' in value &&
    typeof value.forwardRef === 'function'
  ) {
    return value.forwardRef();
  }
  return value;
}
function typeName(value: unknown): string | undefined {
  const resolved = unwrap(value);
  return typeof resolved === 'function' ? resolved.name : undefined;
}

describe('ProcessorsModule scene registration', () => {
  it('loads the content-run module that registers the scene step', () => {
    const imports = (
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, ProcessorsModule) ??
        []) as unknown[]
    ).map(typeName);
    const providers = (
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ContentRunsModule) ??
        []) as unknown[]
    ).map(typeName);
    expect(imports).toContain(ContentRunsModule.name);
    expect(providers).toContain(BrandRemixSceneWorkflowService.name);
  });
});
