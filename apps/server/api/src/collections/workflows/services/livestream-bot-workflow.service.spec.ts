import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LivestreamBotWorkflowService', () => {
  const botsLivestreamService = {
    processActiveSessionsForOrganization: vi.fn(),
  };
  const cacheService = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };

  let service: LivestreamBotWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheService.acquireLock.mockResolvedValue(true);
    cacheService.releaseLock.mockResolvedValue(undefined);
    botsLivestreamService.processActiveSessionsForOrganization.mockResolvedValue(
      {
        action: 'livestreamBotSessionProcessing',
        failed: 0,
        organizationId: 'org-1',
        processed: 1,
        sessions: 1,
        skipped: 0,
        status: 'completed',
      },
    );

    service = new LivestreamBotWorkflowService(
      botsLivestreamService as never,
      cacheService as never,
    );
  });

  it('runs active-session processing behind a per-org lock', async () => {
    const result = await service.runActiveSessionProcessing('org-1');

    expect(cacheService.acquireLock).toHaveBeenCalledWith(
      'livestreamBotSessionProcessing:org-1',
      60,
    );
    expect(
      botsLivestreamService.processActiveSessionsForOrganization,
    ).toHaveBeenCalledWith('org-1');
    expect(cacheService.releaseLock).toHaveBeenCalledWith(
      'livestreamBotSessionProcessing:org-1',
    );
    expect(result).toMatchObject({
      action: 'livestreamBotSessionProcessing',
      processed: 1,
      status: 'completed',
    });
  });

  it('skips duplicate workflow executions when the lock is held', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runActiveSessionProcessing('org-1');

    expect(
      botsLivestreamService.processActiveSessionsForOrganization,
    ).not.toHaveBeenCalled();
    expect(cacheService.releaseLock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reason: 'livestream_bot_processing_locked',
      skipped: 1,
      status: 'skipped',
    });
  });
});
