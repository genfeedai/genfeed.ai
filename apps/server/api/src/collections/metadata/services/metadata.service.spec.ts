import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MetadataExtension } from '@genfeedai/enums';
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
        extension: MetadataExtension.JPEG,
        label: 'Generated media',
      },
    });
  });

  it('preserves a caller-provided label and extension', async () => {
    await service.create({
      extension: MetadataExtension.MP4,
      label: 'Merged launch video',
    });

    expect(metadata.create).toHaveBeenCalledWith({
      data: {
        extension: MetadataExtension.MP4,
        label: 'Merged launch video',
      },
    });
  });

  it('writes only canonical promptId and tag relations', async () => {
    const promptId = '507f1f77bcf86cd799439015';
    const tagId = '507f1f77bcf86cd799439016';

    await service.create({
      extension: MetadataExtension.JPEG,
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
});
