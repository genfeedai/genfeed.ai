import { LoggerService } from '@libs/logger/logger.service';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';
import { describe, expect, it, vi } from 'vitest';

describe('CronWorkflowArtifactsService', () => {
  it('queues one hidden cleanup workflow for the bounded expiry batch', async () => {
    const now = new Date('2026-08-29T12:00:00.000Z');
    const workflowQueue = {
      queueSystemAction: vi.fn().mockResolvedValue('job-1'),
    };
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };
    const service = new CronWorkflowArtifactsService(
      workflowQueue as never,
      logger as unknown as LoggerService,
    );

    await service.queueExpiredArtifactCleanup(now);

    expect(workflowQueue.queueSystemAction).toHaveBeenCalledOnce();
    expect(workflowQueue.queueSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'workflow.artifact.cleanup-expired',
        organizationId: 'genfeed-public-tools',
      }),
      expect.stringMatching(/^workflow\.artifact\.cleanup-expired-/),
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Queued workflow artifact cleanup workflow',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });
});
