import { ContextEmbeddingCoreModule } from '@api/collections/contexts/context-embedding-core.module';
import { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import { describe, expect, it } from 'vitest';

describe('context embedding core boundary', () => {
  it('exposes the same durable execution and completion services to API and workers without an HTTP workflow cycle', () => {
    const imports = Reflect.getMetadata(
      'imports',
      ContextEmbeddingCoreModule,
    ) as Array<{ name?: string; forwardRef?: unknown }>;
    expect(imports.some((item) => item.forwardRef !== undefined)).toBe(false);
    expect(imports.map((item) => item.name)).not.toContain('ContextsModule');
    expect(imports.map((item) => item.name)).not.toContain('WorkflowsModule');
    expect(
      Reflect.getMetadata('controllers', ContextEmbeddingCoreModule) ?? [],
    ).toEqual([]);
    const exports = Reflect.getMetadata(
      'exports',
      ContextEmbeddingCoreModule,
    ) as unknown[];
    expect(exports).toEqual(
      expect.arrayContaining([
        ContextEmbeddingService,
        ContextEmbeddingWriteService,
        KnowledgeEmbeddingCompletionService,
      ]),
    );
  });
});
