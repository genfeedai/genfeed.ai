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
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

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

  it('should route Clerk-authenticated create requests through the unified run service', async () => {
    const mockRun = { _id: 'run-1', traceId: 'trace-1' };
    mockRunsService.createRun.mockResolvedValue({
      reused: false,
      run: mockRun,
    });

    const result = await controller.create(
      {
        publicMetadata: {
          organization: '507f1f77bcf86cd799439011',
          user: '507f1f77bcf86cd799439012',
        },
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
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      RunAuthType.CLERK,
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
        publicMetadata: {
          isApiKey: true,
          organization: '507f1f77bcf86cd799439011',
          user: '507f1f77bcf86cd799439012',
        },
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
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
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
          publicMetadata: {
            organization: '507f1f77bcf86cd799439011',
          },
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
            publicMetadata: {
              organization: '507f1f77bcf86cd799439011',
              user: '507f1f77bcf86cd799439012',
            },
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
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          RunAuthType.CLERK,
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
