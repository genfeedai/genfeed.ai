import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowStepRunnerService } from '@api/collections/workflows/services/workflow-step-runner.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';

const MOCK_USER_ID = testId('user');
const MOCK_ORG_ID = testId('org');
const WORKFLOW_ID = testId('workflow');

const SYSTEMIC_ERROR =
  'Systemic workflow templates cannot be executed directly. Clone the workflow first.';

function createLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createRunner(
  websocket?: NotificationsPublisherService,
  workflowExecutionsService?: {
    completeExecution: ReturnType<typeof vi.fn>;
    createExecution: ReturnType<typeof vi.fn>;
    startExecution: ReturnType<typeof vi.fn>;
  },
) {
  const runner = new WorkflowStepRunnerService(
    {} as unknown as PrismaService,
    createLogger(),
    websocket,
    undefined,
    undefined,
    workflowExecutionsService as never,
  );
  const patch = vi.spyOn(runner, 'patch').mockResolvedValue({} as never);
  const findOne = vi.spyOn(runner, 'findOne');
  return { findOne, patch, runner };
}

describe('WorkflowStepRunnerService', () => {
  describe('executeWorkflow scoping guard', () => {
    it('executes a workflow scoped by the scalar userId/organizationId FKs', async () => {
      const { findOne, patch, runner } = createRunner();
      findOne.mockResolvedValue({
        id: WORKFLOW_ID,
        isDeleted: false,
        label: 'Scoped workflow',
        organizationId: MOCK_ORG_ID,
        steps: [],
        userId: MOCK_USER_ID,
      } as unknown as WorkflowDocument);

      await expect(
        runner.executeWorkflow(WORKFLOW_ID),
      ).resolves.toBeUndefined();

      // Reaching the COMPLETED finalize patch proves the guard let execution
      // through — a phantom-alias read would have thrown before any mutation.
      expect(patch).toHaveBeenCalledWith(
        WORKFLOW_ID,
        expect.objectContaining({ status: WorkflowStatus.COMPLETED }),
      );
    });

    it('rejects an ownerless system workflow', async () => {
      const { findOne, patch, runner } = createRunner();
      findOne.mockResolvedValue({
        id: WORKFLOW_ID,
        isDeleted: false,
        label: 'Ownerless workflow',
        steps: [],
      } as unknown as WorkflowDocument);

      await expect(runner.executeWorkflow(WORKFLOW_ID)).rejects.toThrow(
        SYSTEMIC_ERROR,
      );
      // Guard fires before the RUNNING patch, so no status mutation occurs.
      expect(patch).not.toHaveBeenCalled();
    });
  });

  describe('run status publishing', () => {
    it('publishes completion status keyed by the scalar userId FK', async () => {
      const publishWorkflowStatus = vi.fn();
      const websocket = {
        emit: vi.fn(),
        publishWorkflowStatus,
      } as unknown as NotificationsPublisherService;
      const { findOne, runner } = createRunner(websocket);
      findOne.mockResolvedValue({
        id: WORKFLOW_ID,
        isDeleted: false,
        label: 'Scoped workflow',
        organizationId: MOCK_ORG_ID,
        steps: [],
        userId: MOCK_USER_ID,
      } as unknown as WorkflowDocument);

      await runner.executeWorkflow(WORKFLOW_ID);

      expect(publishWorkflowStatus).toHaveBeenCalledWith(
        WORKFLOW_ID,
        'completed',
        MOCK_USER_ID,
        expect.any(Object),
      );
    });
  });

  it('gives legacy step runs the same durable execution identity', async () => {
    const workflowExecutionsService = {
      completeExecution: vi.fn().mockResolvedValue({}),
      createExecution: vi.fn().mockResolvedValue({ id: 'execution-1' }),
      startExecution: vi.fn().mockResolvedValue({}),
    };
    const { findOne, runner } = createRunner(
      undefined,
      workflowExecutionsService,
    );
    findOne.mockResolvedValue({
      id: WORKFLOW_ID,
      isDeleted: false,
      label: 'Legacy workflow',
      organizationId: MOCK_ORG_ID,
      steps: [],
      userId: MOCK_USER_ID,
    } as unknown as WorkflowDocument);

    await runner.executeWorkflow(WORKFLOW_ID);

    expect(workflowExecutionsService.createExecution).toHaveBeenCalledWith(
      MOCK_USER_ID,
      MOCK_ORG_ID,
      expect.objectContaining({
        trigger: 'legacy-steps',
        workflowId: WORKFLOW_ID,
      }),
    );
    expect(workflowExecutionsService.startExecution).toHaveBeenCalledWith(
      'execution-1',
    );
    expect(workflowExecutionsService.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      undefined,
    );
  });
});
