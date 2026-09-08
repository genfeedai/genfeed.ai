import {
  AgentSourceDownloadService,
  AgentSourceImportPendingError,
} from '@api/services/agent-source-ingest/agent-source-download.service';
import type { AgentSourceIngestContext } from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import { AgentSourceIngestService } from '@api/services/agent-source-ingest/agent-source-ingest.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus, Prisma } from '@genfeedai/prisma';

describe('AgentSourceIngestService', () => {
  const context: AgentSourceIngestContext = {
    organizationId: 'org-1',
    brandId: 'brand-1',
    userId: 'user-1',
    threadId: 'thread-1',
  };
  const prisma = {
    agentThread: { findFirst: vi.fn() },
    ingredient: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const downloader = { normalizeUrl: vi.fn(), download: vi.fn() };
  const service = new AgentSourceIngestService(
    prisma as unknown as PrismaService,
    downloader as unknown as AgentSourceDownloadService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.agentThread.findFirst.mockResolvedValue({ id: context.threadId });
    prisma.ingredient.findFirst.mockResolvedValue(null);
    prisma.ingredient.create.mockResolvedValue({});
    prisma.ingredient.update.mockResolvedValue({});
    prisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
    downloader.normalizeUrl.mockResolvedValue(
      'https://media.example/video.mp4',
    );
    downloader.download.mockResolvedValue({
      publicUrl: 'https://cdn.example/source',
      storageKey: 'ingredients/videos/source',
      kind: 'video',
      extension: 'MP4',
      width: 1920,
      height: 1080,
      duration: 45,
      size: 10000,
      hasAudio: true,
    });
  });

  it('creates one canonical Library source with durable media metadata', async () => {
    const result = await service.ingest(
      { url: 'https://media.example/video.mp4', title: 'Source interview' },
      context,
    );
    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: result.ingredientId,
        organization: { connect: { id: 'org-1' } },
        brand: { connect: { id: 'brand-1' } },
        user: { connect: { id: 'user-1' } },
        status: IngredientStatus.PROCESSING,
        isDeleted: false,
        metadata: {
          create: {
            label: 'Source interview',
            extension: 'MP4',
            isDeleted: false,
          },
        },
      }),
    });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: {
        id: result.ingredientId,
        organizationId: 'org-1',
        brandId: 'brand-1',
        isDeleted: false,
      },
      data: expect.objectContaining({
        status: IngredientStatus.UPLOADED,
        metadata: {
          update: {
            extension: 'MP4',
            width: 1920,
            height: 1080,
            duration: 45,
            size: 10000,
            hasAudio: true,
          },
        },
      }),
    });
  });

  it('returns completed ingestion on retry without downloading again', async () => {
    const first = await service.ingest(
      { url: 'https://media.example/video.mp4' },
      context,
    );
    prisma.ingredient.findFirst.mockResolvedValue({
      id: first.ingredientId,
      status: IngredientStatus.UPLOADED,
    });
    expect(
      await service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).toEqual(first);
    expect(downloader.download).toHaveBeenCalledTimes(1);
    expect(prisma.ingredient.create).toHaveBeenCalledTimes(1);
  });

  it('denies a concurrent retry before download or another create', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'source',
      status: IngredientStatus.PROCESSING,
    });
    prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).rejects.toThrow('already in progress');
    expect(downloader.download).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('rejects a racing initial create on the deterministic primary key', async () => {
    prisma.ingredient.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        clientVersion: 'fixture',
        code: 'P2002',
      }),
    );
    await expect(
      service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).rejects.toThrow('already exists');
    expect(downloader.download).not.toHaveBeenCalled();
  });

  it('resumes the existing queued extraction job after interruption', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'source',
      status: IngredientStatus.PROCESSING,
      generationStage: 'source-job:job-17',
    });
    await service.ingest({ url: 'https://media.example/video.mp4' }, context);
    expect(downloader.download).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      undefined,
      context,
      'job-17',
      expect.any(Function),
    );
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('does not mark uncertain extraction failed or grant a new execution', async () => {
    downloader.download.mockRejectedValue(
      new AgentSourceImportPendingError('still running'),
    );
    await expect(
      service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).rejects.toThrow('still running');
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('records a failed upload and atomically claims a retry on the same ingredient', async () => {
    downloader.download.mockRejectedValueOnce(
      new Error('download unavailable'),
    );
    await expect(
      service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).rejects.toThrow('download unavailable');
    expect(prisma.ingredient.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        organizationId: 'org-1',
        brandId: 'brand-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      }),
      data: {
        status: IngredientStatus.FAILED,
        generationError:
          'Source import failed. Retry this source from the same thread.',
      },
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'source',
      status: IngredientStatus.FAILED,
    });
    await service.ingest({ url: 'https://media.example/video.mp4' }, context);
    expect(prisma.ingredient.create).toHaveBeenCalledTimes(1);
    expect(prisma.ingredient.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ status: IngredientStatus.FAILED }),
      data: {
        status: IngredientStatus.PROCESSING,
        generationError: null,
        generationStage: null,
      },
    });
  });

  it('does not create or fetch for an unauthorized thread', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(null);
    await expect(
      service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).rejects.toThrow('scope');
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(downloader.normalizeUrl).not.toHaveBeenCalled();
  });

  it('revalidates thread scope before committing the uploaded result', async () => {
    prisma.agentThread.findFirst
      .mockResolvedValueOnce({ id: context.threadId })
      .mockResolvedValueOnce(null);
    await expect(
      service.ingest({ url: 'https://media.example/video.mp4' }, context),
    ).rejects.toThrow('scope');
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('checks organization, brand and soft delete for an existing Library source', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'owned-source',
      category: 'VIDEO',
      cdnUrl: 'https://cdn.example/source',
    });
    expect(
      await service.ingest(
        { ingredientId: 'owned-source', kind: 'video' },
        context,
      ),
    ).toEqual({ ingredientId: 'owned-source' });
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owned-source',
        organizationId: 'org-1',
        brandId: 'brand-1',
        isDeleted: false,
        status: { in: ['UPLOADED', 'GENERATED', 'VALIDATED'] },
      },
      select: { id: true, category: true, cdnUrl: true, s3Key: true },
    });
    expect(downloader.download).not.toHaveBeenCalled();
  });

  it('denies unavailable, unfinished and incompatible Library sources', async () => {
    await expect(
      service.ingest({ ingredientId: 'foreign-source' }, context),
    ).rejects.toThrow('Library scope');
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'image',
      category: 'IMAGE',
      cdnUrl: 'https://cdn.example/image',
    });
    await expect(
      service.ingest({ ingredientId: 'image', kind: 'video' }, context),
    ).rejects.toThrow('Library scope');
  });

  it.each([
    {},
    { url: 'https://media.example/video.mp4', ingredientId: 'source' },
  ])('requires exactly one source selector', async (input) => {
    await expect(service.ingest(input, context)).rejects.toThrow('exactly one');
    expect(downloader.download).not.toHaveBeenCalled();
  });
});
