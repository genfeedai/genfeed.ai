import type { AppendRunEventDto } from '@api/collections/runs/dto/create-run.dto';
import {
  Run,
  type RunDocument,
} from '@api/collections/runs/schemas/run.schema';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { RunsMeteringService } from '@api/collections/runs/services/runs-metering.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  RunActionType,
  RunAuthType,
  RunEventType,
  RunMeteringStage,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

function buildRunDocument(partial: Partial<RunDocument> = {}): RunDocument {
  const now = new Date('2026-02-10T12:00:00.000Z');

  return {
    _id: partial._id || 'test-object-id',
    actionType: partial.actionType || RunActionType.GENERATE,
    authType: partial.authType || RunAuthType.CLERK,
    completedAt: partial.completedAt,
    correlationId: partial.correlationId,
    createdAt: now,
    durationMs: partial.durationMs,
    error: partial.error,
    events: partial.events || [],
    input: partial.input || {},
    isDeleted: false,
    metadata: partial.metadata || {},
    organization: partial.organization || 'test-object-id',
    output: partial.output,
    progress: partial.progress ?? 0,
    startedAt: partial.startedAt,
    status: partial.status || RunStatus.PENDING,
    surface: partial.surface || RunSurface.CLI,
    traceId: partial.traceId || 'trace-test',
    trigger: partial.trigger || RunTrigger.MANUAL,
    updatedAt: now,
    user: partial.user || 'test-object-id',
  } as unknown as RunDocument;
}

describe('RunsService', () => {
  let service: RunsService;

  const mockModel = {
    countDocuments: vi.fn(),
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockNotificationsPublisher = {
    emit: vi.fn(),
  };

  const mockRunsMeteringService = {
    record: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunsService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockNotificationsPublisher,
        },
        {
          provide: RunsMeteringService,
          useValue: mockRunsMeteringService,
        },
      ],
    }).compile();

    service = module.get<RunsService>(RunsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list runs with default pagination', async () => {
    const findChain = {
      exec: vi.fn().mockResolvedValue([] as RunDocument[]),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    };

    mockModel.find.mockReturnValue(findChain);
    mockModel.countDocuments.mockResolvedValue(0);

    const result = await service.listRuns('507f1f77bcf86cd799439011', {});

    expect(mockModel.find).toHaveBeenCalled();
    expect(result).toEqual({
      items: [],
      limit: 20,
      offset: 0,
      total: 0,
    });
  });

  it('should enforce a unified create contract across TG/CLI/Extension/IDE and all run actions', async () => {
    const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue(null);

    const createSpy = vi
      .spyOn(service, 'create')
      .mockImplementation(async (payload: Record<string, unknown>) =>
        buildRunDocument({
          _id: 'test-object-id',
          actionType: payload.actionType as RunActionType,
          authType: payload.authType as RunAuthType,
          events: payload.events as RunDocument['events'],
          organization: payload.organization as string,
          progress: Number(payload.progress ?? 0),
          status: payload.status as RunStatus,
          surface: payload.surface as RunSurface,
          traceId: String(payload.traceId),
          user: payload.user as string,
        }),
      );

    const surfaces = [
      RunSurface.TG,
      RunSurface.CLI,
      RunSurface.EXTENSION,
      RunSurface.IDE,
    ];
    const actions = [
      RunActionType.GENERATE,
      RunActionType.POST,
      RunActionType.ANALYTICS,
      RunActionType.COMPOSITE,
    ];

    for (const surface of surfaces) {
      for (const actionType of actions) {
        const result = await service.createRun(
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          RunAuthType.API_KEY,
          {
            actionType,
            idempotencyKey: `idem-${surface}-${actionType}`,
            input: { prompt: 'hello' },
            surface,
            trigger: RunTrigger.MANUAL,
          },
        );

        expect(result.reused).toBe(false);
        expect(result.run.actionType).toBe(actionType);
        expect(result.run.surface).toBe(surface);
        expect(result.run.traceId).toBeTruthy();

        expect(mockRunsMeteringService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType,
            stage: RunMeteringStage.CREATED,
            surface,
          }),
        );

        expect(mockNotificationsPublisher.emit).toHaveBeenCalledWith(
          expect.stringMatching(/\/runs\/.+\/events/),
          expect.objectContaining({
            actionType,
            surface,
            traceId: result.run.traceId,
          }),
        );
      }
    }

    expect(findOneSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
  });

  it('should add trace IDs when appending events and publish to stream', async () => {
    const run = buildRunDocument({
      _id: '507f1f77bcf86cd799439033',
      traceId: 'trace-run-1',
    });

    vi.spyOn(service, 'getRun').mockResolvedValue(run);

    const updated = buildRunDocument({
      ...run,
      events: [
        {
          createdAt: new Date('2026-02-10T12:00:00.000Z'),
          message: 'Run created',
          source: RunSurface.CLI,
          traceId: 'trace-run-1',
          type: RunEventType.CREATED,
        },
        {
          createdAt: new Date('2026-02-10T12:00:01.000Z'),
          message: 'Progress',
          source: 'runs.service',
          traceId: 'trace-run-1',
          type: RunEventType.PROGRESS,
        },
      ],
    });

    mockModel.findByIdAndUpdate.mockResolvedValue(updated);

    await service.appendEventForRun(String(run._id), String(run.organization), {
      message: 'Progress',
      source: 'runs.service',
      type: RunEventType.PROGRESS,
    });

    expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
      String(run._id),
      expect.objectContaining({
        $push: {
          events: expect.objectContaining({
            traceId: 'trace-run-1',
            type: RunEventType.PROGRESS,
          }),
        },
      }),
      { returnDocument: 'after' },
    );

    expect(mockNotificationsPublisher.emit).toHaveBeenCalledWith(
      `/runs/${run._id.toString()}/events`,
      expect.objectContaining({
        runId: run._id.toString(),
        traceId: 'trace-run-1',
      }),
    );
  });

  it('should emit analytics snapshot and progress events on analytics/composite updates', async () => {
    const run = buildRunDocument({
      _id: '507f1f77bcf86cd799439034',
      actionType: RunActionType.ANALYTICS,
      progress: 10,
      status: RunStatus.PENDING,
      traceId: 'trace-analytics-1',
    });

    vi.spyOn(service, 'getRun').mockResolvedValue(run);

    const updated = buildRunDocument({
      ...run,
      progress: 45,
      status: RunStatus.RUNNING,
    });

    mockModel.findByIdAndUpdate.mockResolvedValue(updated);

    const appendSpy = vi
      .spyOn(service, 'appendEventForRun')
      .mockResolvedValue(updated);

    await service.updateRun(String(run._id), String(run.organization), {
      output: {
        engagementRate: 0.21,
        impressions: 1200,
      },
      progress: 45,
      status: RunStatus.RUNNING,
    });

    const eventTypes = appendSpy.mock.calls.map(
      (call) => (call[2] as AppendRunEventDto).type,
    );

    expect(eventTypes).toContain(RunEventType.PROGRESS);
    expect(eventTypes).toContain(RunEventType.ANALYTICS_SNAPSHOT);
    expect(eventTypes).toContain(RunEventType.STARTED);

    expect(mockRunsMeteringService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: RunActionType.ANALYTICS,
        stage: RunMeteringStage.UPDATED,
      }),
    );
  });

  it('should return stream envelopes sorted by createdAt', async () => {
    const run = buildRunDocument({
      _id: '507f1f77bcf86cd799439035',
      events: [
        {
          createdAt: new Date('2026-02-10T12:00:05.000Z'),
          message: 'Second',
          source: 'runs.service',
          traceId: 'trace-sort-1',
          type: RunEventType.PROGRESS,
        },
        {
          createdAt: new Date('2026-02-10T12:00:01.000Z'),
          message: 'First',
          source: 'runs.service',
          traceId: 'trace-sort-1',
          type: RunEventType.CREATED,
        },
      ],
      traceId: 'trace-sort-1',
    });

    vi.spyOn(service, 'getRun').mockResolvedValue(run);

    const events = await service.getRunEvents(
      String(run._id),
      String(run.organization),
    );

    expect(events).toHaveLength(2);
    expect(events?.[0]).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          message: 'First',
          sequence: 0,
        }),
        traceId: 'trace-sort-1',
      }),
    );
    expect(events?.[1]).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          message: 'Second',
          sequence: 1,
        }),
      }),
    );
  });
});
