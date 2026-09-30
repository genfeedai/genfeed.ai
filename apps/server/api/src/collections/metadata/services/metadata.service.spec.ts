import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MetadataExtension as ApiMetadataExtension } from '@genfeedai/contracts';
import { MetadataExtension as PrismaMetadataExtension } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('MetadataService', () => {
  const metadata = {
    create: vi.fn(),
  };
  const logger: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  let service: MetadataService;

  beforeEach(() => {
    vi.clearAllMocks();
    metadata.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'metadata-1',
        ...data,
      }),
    );
    service = new MetadataService(
      { metadata } as never,
      logger as LoggerService,
    );
  });

  it('supplies schema-required defaults at the persistence boundary', async () => {
    await service.create({} as never);

    expect(metadata.create).toHaveBeenCalledWith({
      data: {
        extension: PrismaMetadataExtension.JPEG,
        label: 'Generated media',
      },
    });
  });

  it('preserves a caller-provided label and extension', async () => {
    await service.create({
      extension: ApiMetadataExtension.MP4,
      label: 'Merged launch video',
    });

    expect(metadata.create).toHaveBeenCalledWith({
      data: {
        extension: PrismaMetadataExtension.MP4,
        label: 'Merged launch video',
      },
    });
  });

  it('writes only canonical promptId and tag relations', async () => {
    const promptId = 'cmprompt000000000000000001';
    const tagId = 'cmtag000000000000000000001';

    await service.create({
      extension: ApiMetadataExtension.JPEG,
      promptId,
      tags: [tagId],
    });

    expect(metadata.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptId,
        tags: { connect: [{ id: tagId }] },
      }),
    });
  });

  it('drops invalid relation IDs instead of persisting legacy identifiers', async () => {
    await service.create({
      extension: ApiMetadataExtension.JPEG,
      promptId: '000000000000000000000001',
      tags: ['000000000000000000000002'],
    });

    expect(metadata.create).toHaveBeenCalledWith({
      data: {
        extension: PrismaMetadataExtension.JPEG,
        label: 'Generated media',
      },
    });
  });
});
