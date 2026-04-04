import { CronSchedulerControlService } from '@workers/scheduling/cron-scheduler-control.service';

describe('CronSchedulerControlService', () => {
  const stopA = vi.fn();
  const stopB = vi.fn();

  const schedulerRegistry = {
    getCronJobs: vi.fn(
      () =>
        new Map([
          ['job-a', { stop: stopA }],
          ['job-b', { stop: stopB }],
        ]),
    ),
  };

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const configService = {
    isDevSchedulersEnabled: false,
  };

  let service: CronSchedulerControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.isDevSchedulersEnabled = false;
    service = new CronSchedulerControlService(
      schedulerRegistry as never,
      configService as never,
      logger as never,
    );
  });

  it('stops all registered cron jobs when local schedulers are disabled', () => {
    service.onApplicationBootstrap();

    expect(schedulerRegistry.getCronJobs).toHaveBeenCalledTimes(1);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Disabled 2 cron jobs for local development'),
      'CronSchedulerControlService',
    );
  });

  it('does nothing when schedulers are enabled', () => {
    configService.isDevSchedulersEnabled = true;

    service.onApplicationBootstrap();

    expect(schedulerRegistry.getCronJobs).not.toHaveBeenCalled();
    expect(stopA).not.toHaveBeenCalled();
    expect(stopB).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });
});
