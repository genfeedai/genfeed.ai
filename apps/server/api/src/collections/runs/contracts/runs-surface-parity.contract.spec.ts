import { RunsController } from '@api/collections/runs/controllers/runs.controller';
import {
  RunActionType,
  RunAuthType,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';

const organizationId = testId('org');
const userId = testId('user');

describe('Runs Surface Parity Contract', () => {
  const runsService = {
    appendEventForRun: vi.fn(),
    cancelRun: vi.fn(),
    createRun: vi.fn(),
    executeRun: vi.fn(),
    getRun: vi.fn(),
    getRunEvents: vi.fn(),
    listRuns: vi.fn(),
    updateRun: vi.fn(),
  };

  const controller = new RunsController(runsService as never);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps request contracts identical for TG/CLI/Extension/IDE across generate/post/analytics/composite', async () => {
    runsService.createRun.mockResolvedValue({
      reused: false,
      run: { _id: 'run-parity', traceId: 'trace-parity' },
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
      for (const action of actions) {
        const traceId = `trace-${surface}-${action}`;

        await controller.create(
          {
            organizationId,
            userId,
          } as never,
          {
            headers: {
              'x-trace-id': traceId,
            },
          } as never,
          {
            actionType: action,
            input: { sample: true },
            surface,
            trigger: RunTrigger.MANUAL,
          },
        );

        expect(runsService.createRun).toHaveBeenLastCalledWith(
          userId,
          organizationId,
          RunAuthType.BETTER_AUTH,
          expect.objectContaining({
            actionType: action,
            correlationId: traceId,
            surface,
            traceId,
          }),
        );
      }
    }

    expect(runsService.createRun).toHaveBeenCalledTimes(
      surfaces.length * actions.length,
    );
  });
});
