import { KnowledgeRefreshService } from '@api/collections/contexts/services/knowledge-refresh.service';
import {
  KnowledgeRefreshRunStatus,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

vi.mock('@api/collections/contexts/utils/extract-source-text.util', () => ({
  extractSourceText: vi.fn().mockResolvedValue({
    mimeType: 'text/html',
    notModified: true,
    text: '',
  }),
  KNOWLEDGE_SOURCE_MAX_BYTES: 2_000_000,
}));

const actor = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };

function buildService() {
  const records = {
    createCandidateVersion: vi.fn(),
    getCurrentVersion: vi.fn().mockResolvedValue({
      id: 'version-1',
      payload: { contentFingerprint: 'abc', referenceUrl: 'https://ex.com' },
      provenance: { url: 'https://ex.com' },
    }),
    getSource: vi.fn().mockResolvedValue({
      id: 'source-1',
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.RESEARCH,
      referenceUrl: 'https://ex.com',
    }),
  };
  const ingestWorkflow = { enqueueIngest: vi.fn() };
  const prisma = {
    knowledgeSource: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    knowledgeSourceRefreshRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    knowledgeSourceVersion: { findFirst: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops as Promise<unknown>[]);
      }
      return (ops as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  };
  const logger = { log: vi.fn() };
  return {
    records,
    service: new KnowledgeRefreshService(
      prisma as never,
      records as never,
      ingestWorkflow as never,
      logger as never,
    ),
  };
}

describe('KnowledgeRefreshService', () => {
  it('rejects policy on unsupported kinds', async () => {
    const { service, records } = buildService();
    records.getSource.mockResolvedValueOnce({
      id: 'source-1',
      kind: KnowledgeSourceKind.TEXT,
    });
    await expect(
      service.setPolicy(actor, 'source-1', { isEnabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records an unchanged check on HTTP 304', async () => {
    const { service } = buildService();
    const result = await service.refresh(actor, 'source-1', 'tick-1');
    expect(result.refreshRunId).toBe('run-1');
    expect(result.jobId).toBeUndefined();
  });

  it('reuses an unfinished run instead of creating a second concurrent refresh', async () => {
    const { service } = buildService();
    const prisma = (
      service as unknown as {
        prisma: {
          knowledgeSourceRefreshRun: { findFirst: ReturnType<typeof vi.fn> };
        };
      }
    ).prisma;
    prisma.knowledgeSourceRefreshRun.findFirst.mockResolvedValueOnce({
      id: 'run-existing',
      status: KnowledgeRefreshRunStatus.PROCESSING,
    });
    const result = await service.refresh(actor, 'source-1', 'tick-2');
    expect(result.refreshRunId).toBe('run-existing');
  });
});
