import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { SystemSweepSchedulerService } from '@workers/scheduling/system-sweep-scheduler.service';
import {
  SYSTEM_SWEEP_DEFINITIONS,
  SYSTEM_SWEEPS_QUEUE,
} from '@workers/scheduling/system-sweeps.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SystemSweepSchedulerService', () => {
  let service: SystemSweepSchedulerService;
  let queue: {
    getJobSchedulers: ReturnType<typeof vi.fn>;
    removeJobScheduler: ReturnType<typeof vi.fn>;
    upsertJobScheduler: ReturnType<typeof vi.fn>;
  };
  let configService: { isDevSchedulersEnabled: boolean };

  beforeEach(async () => {
    queue = {
      getJobSchedulers: vi.fn().mockResolvedValue([]),
      removeJobScheduler: vi.fn(),
      upsertJobScheduler: vi.fn(),
    };
    configService = { isDevSchedulersEnabled: true };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSweepSchedulerService,
        {
          provide: getQueueToken(SYSTEM_SWEEPS_QUEUE),
          useValue: queue,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: LoggerService,
          useValue: { log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(SystemSweepSchedulerService);
  });

  it('registers a job scheduler for every sweep definition on bootstrap', async () => {
    await service.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(
      SYSTEM_SWEEP_DEFINITIONS.length,
    );

    for (const definition of SYSTEM_SWEEP_DEFINITIONS) {
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        definition.jobName,
        { pattern: definition.pattern, tz: definition.timezone },
        expect.objectContaining({ name: definition.jobName }),
      );
    }
  });

  it('skips registration when schedulers are disabled for local development', async () => {
    configService.isDevSchedulersEnabled = false;

    await service.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.getJobSchedulers).not.toHaveBeenCalled();
  });

  it('removes stale schedulers no longer present in the manifest', async () => {
    queue.getJobSchedulers.mockResolvedValue([
      { key: SYSTEM_SWEEP_DEFINITIONS[0].jobName },
      { key: 'retired-sweep' },
    ]);

    await service.syncSweepSchedulers();

    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('retired-sweep');
  });
});
