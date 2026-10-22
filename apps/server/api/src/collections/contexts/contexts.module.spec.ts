import { ContextEmbeddingCoreModule } from '@api/collections/contexts/context-embedding-core.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';

describe('ContextsModule', () => {
  it('should be defined', () => {
    expect(ContextsModule).toBeDefined();
    expect(Reflect.getMetadata('imports', ContextsModule)).toContain(
      ContextEmbeddingCoreModule,
    );
    expect(Reflect.getMetadata('exports', ContextsModule)).toContain(
      ContextEmbeddingCoreModule,
    );
  });
});
