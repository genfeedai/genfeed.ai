vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { RouterService } from '@api/services/router/router.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ContextsService.autoCreateFromAccount', () => {
  it('chunks imported posts and embeds each chunk via addEntry', async () => {
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
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      contextBase: {
        create: vi.fn().mockResolvedValue(createdBase),
        findFirst: vi.fn().mockResolvedValue(createdBase),
      },
      contextEntry: {
        create: vi.fn().mockResolvedValue({
          data: {},
          id: 'entry-1',
          organizationId: 'org-1',
        }),
      },
      post: { findMany: vi.fn().mockResolvedValue(posts) },
    };
    const generateEmbedding = vi
      .fn()
      .mockResolvedValue(new Array(1024).fill(0.1));
    const service = new ContextsService(
      prisma as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      { generateEmbedding } as unknown as ReplicateService,
      {
        getDefaultModel: vi.fn().mockResolvedValue('bge'),
      } as unknown as RouterService,
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
    );

    expect(prisma.post.findMany).toHaveBeenCalled();
    expect(prisma.contextEntry.create.mock.calls.length).toBeGreaterThan(1);
    expect(generateEmbedding.mock.calls.length).toBeGreaterThan(1);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    const firstCreate = prisma.contextEntry.create.mock.calls[0]?.[0] as
      | { data: { data: { metadata: { source: string } } } }
      | undefined;
    expect(firstCreate?.data.data.metadata.source).toBe('social-post');
  });
});
