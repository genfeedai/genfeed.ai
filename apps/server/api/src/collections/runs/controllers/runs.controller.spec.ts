vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { RunsController } from '@api/collections/runs/controllers/runs.controller';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  RunActionType,
  RunAuthType,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const organizationId = testId('org');
const userId = testId('user');

describe('RunsController', () => {
  let controller: RunsController;

  const mockRunsService = {
    appendEventForRun: vi.fn(),
    cancelRun: vi.fn(),
    createRun: vi.fn(),
    executeRun: vi.fn(),
    getRun: vi.fn(),
    getRunEvents: vi.fn(),
    listRuns: vi.fn(),
    updateRun: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunsController],
      providers: [
        {
          provide: RunsService,
          useValue: mockRunsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RunsController>(RunsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should route legacy-auth-provider-authenticated create requests through the unified run service', async () => {
    const mockRun = { _id: 'run-1', traceId: 'trace-1' };
    mockRunsService.createRun.mockResolvedValue({
      reused: false,
      run: mockRun,
    });

    const result = await controller.create(
      {
        organizationId: organizationId,
        userId: userId,
      } as never,
      { headers: { 'x-trace-id': 'trace-from-header' } } as never,
      {
        actionType: RunActionType.GENERATE,
        input: { prompt: 'hello' },
        surface: RunSurface.CLI,
        trigger: RunTrigger.MANUAL,
      },
    );

    expect(mockRunsService.createRun).toHaveBeenCalledWith(
      userId,
      organizationId,
      RunAuthType.BETTER_AUTH,
      expect.objectContaining({
        actionType: RunActionType.GENERATE,
        correlationId: 'trace-from-header',
        surface: RunSurface.CLI,
        traceId: 'trace-from-header',
      }),
    );

    expect(result).toEqual(mockRun);
  });

  it('should route API key authenticated create requests through the unified run service', async () => {
    const mockRun = { _id: 'run-2', traceId: 'trace-2' };
    mockRunsService.createRun.mockResolvedValue({
      reused: false,
      run: mockRun,
    });

    await controller.create(
      {
        isApiKey: true,
        organizationId: organizationId,
        userId: userId,
      } as never,
      { headers: {} } as never,
      {
        actionType: RunActionType.POST,
        input: { payload: 'post-id' },
        surface: RunSurface.TG,
        traceId: 'trace-body',
        trigger: RunTrigger.API,
      },
    );

    expect(mockRunsService.createRun).toHaveBeenCalledWith(
      userId,
      organizationId,
      RunAuthType.API_KEY,
      expect.objectContaining({
        actionType: RunActionType.POST,
        correlationId: 'trace-body',
        surface: RunSurface.TG,
        traceId: 'trace-body',
      }),
    );
  });

  it('should reject missing org/user context', async () => {
    await expect(
      controller.create(
        {
          organizationId: organizationId,
        } as never,
        { headers: {} } as never,
        {
          actionType: RunActionType.GENERATE,
          surface: RunSurface.CLI,
          trigger: RunTrigger.MANUAL,
        },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('cancels a run via PATCH { status: cancelled }', async () => {
    const mockRun = { _id: 'run-cancel', status: RunStatus.CANCELLED };
    mockRunsService.cancelRun.mockResolvedValue(mockRun);

    const result = await controller.update(
      {
        organizationId: organizationId,
        userId: userId,
      } as never,
      { headers: {} } as never,
      'run-cancel',
      { status: RunStatus.CANCELLED },
    );

    expect(mockRunsService.cancelRun).toHaveBeenCalledWith(
      'run-cancel',
      organizationId,
    );
    expect(mockRunsService.updateRun).not.toHaveBeenCalled();
    expect(result).toEqual(mockRun);
  });

  it('should maintain identical create contract across TG/CLI/Extension/IDE surfaces and all run actions', async () => {
    const mockRun = { _id: 'run-contract', traceId: 'trace-contract' };
    mockRunsService.createRun.mockResolvedValue({
      reused: false,
      run: mockRun,
    });

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
        await controller.create(
          {
            organizationId: organizationId,
            userId: userId,
          } as never,
          {
            headers: { 'x-trace-id': `trace-${surface}-${actionType}` },
          } as never,
          {
            actionType,
            input: { target: 'account' },
            surface,
            trigger: RunTrigger.MANUAL,
          },
        );

        expect(mockRunsService.createRun).toHaveBeenLastCalledWith(
          userId,
          organizationId,
          RunAuthType.BETTER_AUTH,
          expect.objectContaining({
            actionType,
            correlationId: `trace-${surface}-${actionType}`,
            surface,
            traceId: `trace-${surface}-${actionType}`,
          }),
        );
      }
    }
  });
});
