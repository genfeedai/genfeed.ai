import type { ContextEmbeddingWriteInput } from '@api/collections/contexts/interfaces/context-embedding-write.interface';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import type { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { RouterService } from '@api/services/router/router.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ContextsService.autoCreateFromAccount', () => {
  it('chunks imported posts and admits every chunk through the durable writer', async () => {
    const createdBase = {
      data: { label: 'Library', type: 'content_library' },
      id: 'ctx-1',
      isDeleted: false,
      organizationId: 'org-1',
    };
    const posts = [
      {
        description: `${'Long published post. '.repeat(80)}Done.`,
        id: 'post-1',
        label: 'Winner',
        publicationDate: new Date('2026-01-01'),
        scheduledDate: null,
      },
      {
        description: '',
        id: 'post-2',
        label: '',
        publicationDate: null,
        scheduledDate: null,
      },
    ];
    const embeddingRequests: unknown[] = [];
    const writes: ContextEmbeddingWriteInput[] = [];
    const prisma = {
      $executeRaw: async () => 1,
      brand: { findFirst: async () => ({ id: 'brand-1' }) },
      contextBase: {
        create: async () => createdBase,
        findFirst: async () => createdBase,
      },
      contextEntry: {
        create: async () => {
          throw new Error(
            'entries must be admitted through the durable writer',
          );
        },
      },
      post: { findMany: async () => posts },
    };
    const embeddings = async (request: unknown) => {
      embeddingRequests.push(request);
      return { data: [{ embedding: new Array(1024).fill(0.1), index: 0 }] };
    };
    const writer = {
      write: async (input: ContextEmbeddingWriteInput) => {
        writes.push(input);
        return {
          data: { content: input.dto.content, metadata: input.dto.metadata },
          id: `entry-${writes.length}`,
          organizationId: input.organizationId,
        };
      },
    };
    const principal = {
      origin: 'ACTOR' as const,
      actor: {
        userId: 'user-1',
        organizationId: 'org-1',
        isApiKey: false,
        scopes: [],
      },
    };
    const service = new ContextsService(
      prisma as unknown as PrismaService,
      {
        debug: () => undefined,
        error: () => undefined,
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      new ContextEmbeddingProviderService(
        {
          getDefaultModel: async () => 'bge',
        } as unknown as RouterService,
        { embeddings } as unknown as OpenRouterService,
      ),
      writer as unknown as ContextEmbeddingWriteService,
    );

    await service.autoCreateFromAccount(
      {
        brandId: 'brand-1',
        description: 'Imported posts',
        label: 'Library',
        platform: 'twitter',
      },
      'org-1',
      'user-1',
      principal,
    );

    expect(writes.length).toBeGreaterThan(1);
    expect(writes).toContainEqual(
      expect.objectContaining({
        contextBaseId: 'ctx-1',
        dto: expect.objectContaining({
          metadata: expect.objectContaining({ source: 'social-post' }),
        }),
        principal,
      }),
    );
    expect(embeddingRequests).toEqual([]);
  });
});
