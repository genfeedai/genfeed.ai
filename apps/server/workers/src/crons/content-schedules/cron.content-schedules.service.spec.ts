import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronContentSchedulesService } from '@workers/crons/content-schedules/cron.content-schedules.service';

describe('CronContentSchedulesService', () => {
  let service: CronContentSchedulesService;
  let contentSchedulesService: {
    calculateNextRunAt: ReturnType<typeof vi.fn>;
    getActiveSchedules: ReturnType<typeof vi.fn>;
    markScheduleRan: ReturnType<typeof vi.fn>;
  };
  let contentGatewayService: { routeSignal: ReturnType<typeof vi.fn> };
  let cacheService: {
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronContentSchedulesService,
        {
          provide: ContentSchedulesService,
          useValue: {
            calculateNextRunAt: vi
              .fn()
              .mockReturnValue(new Date('2026-01-01T00:01:00Z')),
            getActiveSchedules: vi.fn().mockResolvedValue([
              {
                _id: 'schedule-1',
                brand: { toString: () => 'brand-1' },
                cronExpression: '*/5 * * * *',
                organization: { toString: () => 'org-1' },
                skillParams: {},
                skillSlugs: ['content-writing'],
                timezone: 'UTC',
              },
            ]),
            markScheduleRan: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ContentGatewayService,
          useValue: {
            routeSignal: vi
              .fn()
              .mockResolvedValue({ drafts: [], runs: ['run-1'] }),
          },
        },
        {
          provide: CacheService,
          useValue: {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CronContentSchedulesService);
    contentSchedulesService = module.get(ContentSchedulesService);
    contentGatewayService = module.get(ContentGatewayService);
    cacheService = module.get(CacheService);
  });

  it('processes due schedules and routes signals', async () => {
    await service.processContentSchedules();

    expect(cacheService.acquireLock).toHaveBeenCalled();
    expect(contentSchedulesService.getActiveSchedules).toHaveBeenCalled();
    expect(contentGatewayService.routeSignal).toHaveBeenCalled();
    expect(contentSchedulesService.markScheduleRan).toHaveBeenCalled();
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });
});
