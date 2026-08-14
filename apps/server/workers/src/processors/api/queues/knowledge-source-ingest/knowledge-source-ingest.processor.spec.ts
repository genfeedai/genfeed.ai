import {
  KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME,
  KNOWLEDGE_SOURCE_INGEST_JOB_NAME,
  type KnowledgeSourceBackfillJobData,
  type KnowledgeSourceIngestJobData,
} from '@genfeedai/queue-contracts';
import { KnowledgeSourceIngestProcessor } from '@workers/processors/api/queues/knowledge-source-ingest/knowledge-source-ingest.processor';
import type { Job } from 'bullmq';

describe('KnowledgeSourceIngestProcessor', () => {
  it('ingests a single source job', async () => {
    const ingestService = {
      ingest: vi.fn().mockResolvedValue({ status: 'completed' }),
      scanForBackfill: vi.fn(),
    };
    const ingestQueue = { enqueueIngest: vi.fn() };
    const processor = new KnowledgeSourceIngestProcessor(
      ingestService as never,
      ingestQueue as never,
      { warn: vi.fn(), log: vi.fn() } as never,
    );

    await processor.process({
      data: {
        contextBaseId: 'ctx-1',
        organizationId: 'org-1',
        sourceId: 'src_1',
      },
      name: KNOWLEDGE_SOURCE_INGEST_JOB_NAME,
    } as Job<KnowledgeSourceIngestJobData>);

    expect(ingestService.ingest).toHaveBeenCalledWith({
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    });
  });

  it('scans and enqueues ingest jobs for a backfill', async () => {
    const item = {
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    };
    const ingestService = {
      ingest: vi.fn(),
      scanForBackfill: vi.fn().mockResolvedValue({ queued: [item] }),
    };
    const ingestQueue = { enqueueIngest: vi.fn().mockResolvedValue('job-1') };
    const processor = new KnowledgeSourceIngestProcessor(
      ingestService as never,
      ingestQueue as never,
      { warn: vi.fn(), log: vi.fn() } as never,
    );

    await processor.process({
      data: { organizationId: 'org-1' },
      name: KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME,
    } as Job<KnowledgeSourceBackfillJobData>);

    expect(ingestService.scanForBackfill).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(ingestQueue.enqueueIngest).toHaveBeenCalledWith(item);
  });
});
