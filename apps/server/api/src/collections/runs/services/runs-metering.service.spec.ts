import { RunsMeteringService } from '@api/collections/runs/services/runs-metering.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  RunActionType,
  RunAuthType,
  RunMeteringStage,
  RunStatus,
  RunSurface,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const organizationId = testId('org');
const userId = testId('user');

describe('RunsMeteringService', () => {
  let service: RunsMeteringService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockNotificationsPublisher = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunsMeteringService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockNotificationsPublisher,
        },
      ],
    }).compile();

    service = module.get<RunsMeteringService>(RunsMeteringService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should emit metering events for billing hooks', async () => {
    await service.record({
      actionType: RunActionType.GENERATE,
      authType: RunAuthType.BETTER_AUTH,
      organizationId,
      progress: 10,
      runId: 'run-1',
      stage: RunMeteringStage.CREATED,
      status: RunStatus.PENDING,
      surface: RunSurface.CLI,
      traceId: 'trace-1',
      userId,
    });

    expect(mockNotificationsPublisher.emit).toHaveBeenCalledWith(
      '/runs/run-1/metering',
      expect.objectContaining({
        actionType: RunActionType.GENERATE,
        pricingModel: 'plan_and_usage_credits',
        stage: RunMeteringStage.CREATED,
        traceId: 'trace-1',
      }),
    );
  });

  it('should swallow publish errors and warn', async () => {
    mockNotificationsPublisher.emit.mockRejectedValueOnce(
      new Error('redis unavailable'),
    );

    await service.record({
      actionType: RunActionType.POST,
      authType: RunAuthType.API_KEY,
      organizationId,
      progress: 50,
      runId: 'run-2',
      stage: RunMeteringStage.UPDATED,
      status: RunStatus.RUNNING,
      surface: RunSurface.TG,
      traceId: 'trace-2',
      userId,
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Run metering hook failed',
      expect.objectContaining({
        payload: expect.objectContaining({
          runId: 'run-2',
        }),
      }),
    );
  });
});
