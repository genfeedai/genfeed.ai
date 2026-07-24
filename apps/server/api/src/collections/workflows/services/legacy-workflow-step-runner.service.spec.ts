import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

// Prisma rows expose the scalar FKs `userId`/`organizationId`. The Mongo-era
// `user`/`organization` aliases are type-only fields that are undefined at
// runtime on the unpopulated `EntityFactory.fromDocument()` result the runner
// builds, so scoping MUST resolve from the scalar FKs — see
// docs/identity-resolution.md and .agents/memory/rules/prisma_legacy_alias_fields.md.
const MOCK_USER_ID = '507f1f77bcf86cd799439011';
const MOCK_ORG_ID = '507f1f77bcf86cd799439012';
const WORKFLOW_ID = '507f1f77bcf86cd799439013';

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

function createRunner(websocket?: NotificationsPublisherService) {
  const runner = new LegacyWorkflowStepRunner(
    {} as unknown as PrismaService,
    createLogger(),
    websocket,
  );
  const patch = vi.spyOn(runner, 'patch').mockResolvedValue({} as never);
  const findOne = vi.spyOn(runner, 'findOne');
  return { findOne, patch, runner };
}

describe('LegacyWorkflowStepRunner', () => {
  describe('executeWorkflow scoping guard', () => {
    it('executes a workflow scoped by the scalar userId/organizationId FKs', async () => {
      const { findOne, patch, runner } = createRunner();
      // Live Prisma shape: scalar FKs present, no Mongo-era aliases.
      findOne.mockResolvedValue({
        _id: WORKFLOW_ID,
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

    it('rejects a workflow that only carries the Mongo-era user/organization aliases', async () => {
      const { findOne, patch, runner } = createRunner();
      // Pre-fix regression: reading `workflow.user`/`workflow.organization`
      // would have treated this row as validly scoped. The scalar FKs are
      // absent, so the guard must reject it.
      findOne.mockResolvedValue({
        _id: WORKFLOW_ID,
        isDeleted: false,
        label: 'Alias-only workflow',
        organization: MOCK_ORG_ID,
        steps: [],
        user: MOCK_USER_ID,
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
        _id: WORKFLOW_ID,
        isDeleted: false,
        label: 'Scoped workflow',
        organizationId: MOCK_ORG_ID,
        steps: [],
        userId: MOCK_USER_ID,
      } as unknown as WorkflowDocument);

      await runner.executeWorkflow(WORKFLOW_ID);

      // Third arg is the scalar userId, not `String(undefined)` — this row has
      // no `user` alias, so a phantom read would have published 'undefined'.
      expect(publishWorkflowStatus).toHaveBeenCalledWith(
        WORKFLOW_ID,
        'completed',
        MOCK_USER_ID,
        expect.any(Object),
      );
    });
  });
});
