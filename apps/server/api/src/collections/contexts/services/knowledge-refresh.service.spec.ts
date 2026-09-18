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
      isRefreshEnabled: true,
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeSourceRefreshRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeSourceVersion: { findFirst: vi.fn() },
    workflow: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': '1' }]),
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
      { createWorkflow: vi.fn() } as never,
      { syncWorkflowScheduler: vi.fn() } as never,
    ),
  };
}

describe('KnowledgeRefreshService', () => {
  it('skips a scheduled tick when nextCheckAt is still in the future', async () => {
    const { service, records } = buildService();
    records.getSource.mockResolvedValueOnce({
      id: 'source-1',
      kind: KnowledgeSourceKind.URL,
      nextCheckAt: new Date(Date.now() + 60_000),
    });
    const prisma = (
      service as unknown as {
        prisma: {
          knowledgeSourceRefreshRun: {
            create: ReturnType<typeof vi.fn>;
            findFirst: ReturnType<typeof vi.fn>;
          };
        };
      }
    ).prisma;
    const result = await service.refresh(actor, 'source-1', 'fire-1');
    expect(result.refreshRunId).toBe('source-1');
    expect(prisma.knowledgeSourceRefreshRun.create).not.toHaveBeenCalled();
  });

  it('skips a scheduled tick when refresh is disabled', async () => {
    const { service, records } = buildService();
    records.getSource.mockResolvedValueOnce({
      id: 'source-1',
      isRefreshEnabled: false,
      kind: KnowledgeSourceKind.URL,
      nextCheckAt: new Date(Date.now() - 60_000),
    });
    const result = await service.refresh(actor, 'source-1', 'fire-2');
    expect(result.refreshRunId).toBe('source-1');
  });

  it('forces a due check even when the next check is in the future', async () => {
    const { service, records } = buildService();
    records.getSource.mockResolvedValue({
      id: 'source-1',
      isRefreshEnabled: false,
      kind: KnowledgeSourceKind.URL,
      nextCheckAt: new Date(Date.now() + 60_000),
      referenceUrl: 'https://ex.com',
    });
    const result = await service.refresh(actor, 'source-1', 'manual-1', {
      force: true,
    });
    expect(result.refreshRunId).toBe('run-1');
  });

  it('creates a 15-minute source-maintenance workflow when refresh is enabled', async () => {
    const { service, records } = buildService();
    const workflows = (
      service as unknown as {
        workflows: { createWorkflow: ReturnType<typeof vi.fn> };
      }
    ).workflows;
    workflows.createWorkflow.mockResolvedValue({ id: 'wf-refresh' });
    records.getSource.mockResolvedValueOnce({
      id: 'source-1',
      kind: KnowledgeSourceKind.URL,
      referenceUrl: 'https://ex.com',
      title: 'Docs',
    });
    await service.setPolicy(actor, 'source-1', { isEnabled: true });
    expect(workflows.createWorkflow).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      expect.objectContaining({
        isScheduleEnabled: true,
        schedule: '*/15 * * * *',
        templateId: 'source-maintenance',
      }),
    );
  });

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

  it('does not re-execute a live leased refresh run', async () => {
    const { service } = buildService();
    const prisma = (
      service as unknown as {
        prisma: {
          knowledgeSourceRefreshRun: { findFirst: ReturnType<typeof vi.fn> };
        };
      }
    ).prisma;
    prisma.knowledgeSourceRefreshRun.findFirst.mockResolvedValueOnce({
      candidateVersionId: 'candidate-1',
      id: 'run-live',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      status: KnowledgeRefreshRunStatus.PROCESSING,
    });
    const result = await service.refresh(actor, 'source-1', 'tick-live');
    expect(result).toEqual({
      jobId: 'candidate-1',
      refreshRunId: 'run-live',
      sourceId: 'source-1',
    });
  });
});
