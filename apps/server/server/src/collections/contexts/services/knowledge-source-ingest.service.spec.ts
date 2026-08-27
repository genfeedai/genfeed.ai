import type { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { KnowledgeSourceIngestService } from '@server/collections/contexts/services/knowledge-source-ingest.service';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { KnowledgeBaseCategory, KnowledgeBaseStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { DestinationGuardError } from '@libs/security/destination-guard';

const extractSourceText = vi.hoisted(() => vi.fn());

vi.mock(
  '@server/collections/contexts/utils/extract-source-text.util',
  async () => {
    const actual = await vi.importActual<
      typeof import('@server/collections/contexts/utils/extract-source-text.util')
    >('@server/collections/contexts/utils/extract-source-text.util');
    return {
      ...actual,
      extractSourceText,
    };
  },
);

describe('KnowledgeSourceIngestService', () => {
  function buildService() {
    const addEntry = vi.fn().mockResolvedValue({ id: 'entry-1' });
    const removeEntriesBySource = vi.fn().mockResolvedValue(2);
    const contextBaseUpdate = vi.fn().mockResolvedValue({});
    const contextBaseFindFirst = vi.fn();
    const contextBaseFindMany = vi.fn().mockResolvedValue([]);

    const service = new KnowledgeSourceIngestService(
      {
        contextBase: {
          findFirst: contextBaseFindFirst,
          findMany: contextBaseFindMany,
          update: contextBaseUpdate,
        },
      } as unknown as PrismaService,
      {
        addEntry,
        removeEntriesBySource,
      } as unknown as ContextsService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );

    return {
      addEntry,
      contextBaseFindFirst,
      contextBaseFindMany,
      contextBaseUpdate,
      removeEntriesBySource,
      service,
    };
  }

  function sourceBase(overrides: Record<string, unknown> = {}) {
    return {
      data: {
        label: 'Brand knowledge',
        purpose: 'knowledge-base',
        sources: [
          {
            category: KnowledgeBaseCategory.URL,
            id: 'src_1',
            label: 'Docs',
            referenceUrl: 'https://docs.example.com/voice',
            status: KnowledgeBaseStatus.DRAFT,
          },
        ],
      },
      id: 'ctx-1',
      isDeleted: false,
      organizationId: 'org-1',
      ...overrides,
    };
  }

  beforeEach(() => {
    extractSourceText.mockReset();
  });

  it('chunks extracted URL text, replaces prior entries, and embeds each chunk', async () => {
    const {
      addEntry,
      contextBaseFindFirst,
      contextBaseUpdate,
      removeEntriesBySource,
      service,
    } = buildService();
    contextBaseFindFirst.mockResolvedValue(sourceBase());
    extractSourceText.mockResolvedValue({
      mimeType: 'text/html',
      text: `${'Brand voice. '.repeat(90)}End.`,
    });

    const result = await service.ingest({
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    });

    expect(extractSourceText).toHaveBeenCalledWith({
      category: KnowledgeBaseCategory.URL,
      referenceUrl: 'https://docs.example.com/voice',
    });
    expect(removeEntriesBySource).toHaveBeenCalledWith(
      'ctx-1',
      'src_1',
      'org-1',
    );
    expect(addEntry.mock.calls.length).toBeGreaterThan(1);
    expect(addEntry).toHaveBeenNthCalledWith(
      1,
      'ctx-1',
      expect.objectContaining({
        content: expect.stringContaining('Brand voice.'),
        metadata: expect.objectContaining({
          chunkIndex: 0,
          kind: 'knowledge-source-chunk',
          sourceId: 'src_1',
        }),
      }),
      'org-1',
    );
    expect(result).toMatchObject({
      chunkCount: addEntry.mock.calls.length,
      status: 'completed',
    });
    expect(contextBaseUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            sources: [
              expect.objectContaining({
                chunkCount: addEntry.mock.calls.length,
                status: KnowledgeBaseStatus.COMPLETED,
              }),
            ],
          }),
        }),
        where: {
          id: 'ctx-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('marks unsupported categories failed without embedding', async () => {
    const { addEntry, contextBaseFindFirst, service } = buildService();
    contextBaseFindFirst.mockResolvedValue(
      sourceBase({
        data: {
          sources: [
            {
              category: KnowledgeBaseCategory.VIDEO,
              id: 'src_1',
              label: 'Clip',
              referenceUrl: 'https://cdn.example.com/clip.mp4',
              status: KnowledgeBaseStatus.DRAFT,
            },
          ],
        },
      }),
    );

    const result = await service.ingest({
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    });

    expect(result.status).toBe('unsupported');
    expect(addEntry).not.toHaveBeenCalled();
    expect(extractSourceText).not.toHaveBeenCalled();
  });

  it('marks the source failed when the destination guard rejects the URL', async () => {
    const { addEntry, contextBaseFindFirst, contextBaseUpdate, service } =
      buildService();
    contextBaseFindFirst.mockResolvedValue(sourceBase());
    extractSourceText.mockRejectedValue(
      new DestinationGuardError('private address'),
    );

    const result = await service.ingest({
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    });

    expect(result.status).toBe('failed');
    expect(addEntry).not.toHaveBeenCalled();
    expect(contextBaseUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            sources: [
              expect.objectContaining({
                status: KnowledgeBaseStatus.FAILED,
              }),
            ],
          }),
        }),
        where: {
          id: 'ctx-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('returns an empty backfill scan when no tenant is provided', async () => {
    const { contextBaseFindMany, service } = buildService();

    await expect(service.scanForBackfill({})).resolves.toEqual({ queued: [] });
    expect(contextBaseFindMany).not.toHaveBeenCalled();
  });

  it('scans draft and failed sources for backfill', async () => {
    const { contextBaseFindMany, service } = buildService();
    contextBaseFindMany.mockResolvedValue([
      sourceBase(),
      sourceBase({
        data: {
          sources: [
            {
              category: KnowledgeBaseCategory.URL,
              id: 'src_done',
              label: 'Done',
              referenceUrl: 'https://docs.example.com',
              status: KnowledgeBaseStatus.COMPLETED,
            },
          ],
        },
        id: 'ctx-2',
      }),
    ]);

    await expect(
      service.scanForBackfill({ organizationId: 'org-1' }),
    ).resolves.toEqual({
      queued: [
        {
          contextBaseId: 'ctx-1',
          organizationId: 'org-1',
          sourceId: 'src_1',
        },
      ],
    });
  });

  it('skips deleted sources and missing rows', async () => {
    const { addEntry, contextBaseFindFirst, service } = buildService();
    contextBaseFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(
      sourceBase({
        data: {
          sources: [
            {
              category: KnowledgeBaseCategory.URL,
              id: 'src_1',
              isDeleted: true,
              label: 'Docs',
              referenceUrl: 'https://docs.example.com',
              status: KnowledgeBaseStatus.DRAFT,
            },
          ],
        },
      }),
    );

    await expect(
      service.ingest({
        contextBaseId: 'ctx-1',
        organizationId: 'org-1',
        sourceId: 'src_1',
      }),
    ).resolves.toMatchObject({ status: 'skipped' });
    await expect(
      service.ingest({
        contextBaseId: 'ctx-1',
        organizationId: 'org-1',
        sourceId: 'src_1',
      }),
    ).resolves.toMatchObject({ status: 'skipped' });
    expect(addEntry).not.toHaveBeenCalled();
  });
});
