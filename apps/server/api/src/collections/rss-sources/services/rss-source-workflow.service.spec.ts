import { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';

describe('RssSourceWorkflowService.enqueueSweep', () => {
  const rssSources = { hasEnabledForSweep: vi.fn() };
  const queue = { queueSystemWorkflow: vi.fn() };
  const runner = { registerAction: vi.fn(), registerWorkflow: vi.fn() };

  let service: RssSourceWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    queue.queueSystemWorkflow.mockResolvedValue('job-1');
    service = new RssSourceWorkflowService(
      rssSources as never,
      queue as never,
      runner as never,
    );
  });

  it('queues nothing and persists no execution when no source is enabled (#5634)', async () => {
    rssSources.hasEnabledForSweep.mockResolvedValue(false);

    await expect(service.enqueueSweep()).resolves.toBeNull();

    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('queues the sweep with a quarter-hour bucketed job id when a source is enabled', async () => {
    rssSources.hasEnabledForSweep.mockResolvedValue(true);

    await expect(
      service.enqueueSweep(new Date('2026-09-07T12:34:00Z')),
    ).resolves.toBe('job-1');

    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'rss_autopost_sweep',
        trigger: 'scheduled',
      }),
      expect.stringMatching(/^rss-sweep-\d+$/),
      expect.objectContaining({ attempts: 3 }),
    );
  });
});
