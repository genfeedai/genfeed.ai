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
    workflow: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
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
    prisma.knowledgeSourceRefreshRun.create.mockResolvedValue({ id: 'skip-1' });
    const result = await service.refresh(actor, 'source-1', 'fire-1');
    expect(result.refreshRunId).toBe('skip-1');
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
});
