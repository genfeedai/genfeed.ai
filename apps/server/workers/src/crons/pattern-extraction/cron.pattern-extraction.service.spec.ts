import type { LoggerService } from '@libs/logger/logger.service';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import type { PatternExtractionWorkflowService } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction-workflow.service';

describe('CronPatternExtractionService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;
  const patternWorkflow = {
    listEligibleOrganizationIds: vi.fn(),
    queueOrganization: vi.fn(),
  } as unknown as PatternExtractionWorkflowService;
  const service = new CronPatternExtractionService(logger, patternWorkflow);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(patternWorkflow.listEligibleOrganizationIds).mockResolvedValue([
      'org-1',
      'org-2',
    ]);
    vi.mocked(patternWorkflow.queueOrganization).mockResolvedValue(
      'execution-1',
    );
  });

  it('queues one tenant workflow for every eligible organization', async () => {
    await service.computeDailyPatterns();

    expect(patternWorkflow.queueOrganization).toHaveBeenCalledTimes(2);
    expect(patternWorkflow.queueOrganization).toHaveBeenNthCalledWith(
      1,
      'org-1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(patternWorkflow.queueOrganization).toHaveBeenNthCalledWith(
      2,
      'org-2',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('continues scheduling other tenants when one enqueue fails', async () => {
    vi.mocked(patternWorkflow.queueOrganization)
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce('execution-2');

    await expect(service.computeDailyPatterns()).resolves.toBeUndefined();

    expect(patternWorkflow.queueOrganization).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to queue organization'),
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('logs an enumeration failure without inventing a global execution', async () => {
    const error = new Error('database unavailable');
    vi.mocked(patternWorkflow.listEligibleOrganizationIds).mockRejectedValue(
      error,
    );

    await expect(service.computeDailyPatterns()).resolves.toBeUndefined();

    expect(patternWorkflow.queueOrganization).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      error,
    );
  });
});
