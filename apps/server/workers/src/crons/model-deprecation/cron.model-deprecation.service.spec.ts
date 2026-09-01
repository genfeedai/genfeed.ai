import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';

describe('CronModelDeprecationService', () => {
  it('never changes lifecycle automatically', async () => {
    const logger = { log: vi.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronModelDeprecationService,
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    const service = module.get(CronModelDeprecationService);
    await expect(service.deprecateSupersededModels()).resolves.toEqual({
      deprecated: 0,
      evaluated: 0,
      skippedDueToSuccessorAge: 0,
      skippedDueToUsage: 0,
      skippedDueToWorkflows: 0,
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('disabled'),
    );
  });
});
