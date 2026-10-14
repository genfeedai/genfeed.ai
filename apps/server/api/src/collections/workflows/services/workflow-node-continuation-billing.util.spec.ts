import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import { runWithWorkflowGenerationDispatch } from '@api/collections/workflow-executions/services/workflow-generation-dispatch.context';
import { recordFundedWorkflowSubmissionIntent } from '@api/collections/workflows/services/workflow-node-continuation-billing.util';
import { workflowGenerationOperationId } from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const assertWorkflowExecutionAdmission = vi.hoisted(() => vi.fn());
vi.mock('@api/helpers/utils/credits/workflow-execution-admission.util', () => ({
  assertWorkflowExecutionAdmission,
  lockWorkflowExecutionFunding: vi.fn(),
}));

function service() {
  return new WorkflowGenerationBillingService(
    {} as PrismaService,
    {} as CreditsUtilsService,
    { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
  );
}

function dispatch(operationId: string, dispatchFingerprint?: string) {
  return {
    claimId: 'claim-1',
    ...(dispatchFingerprint ? { dispatchFingerprint } : {}),
    executionId: 'execution-a',
    inputs: new Map(),
    operationId,
    organizationId: 'org-a',
  };
}

describe('recordFundedWorkflowSubmissionIntent', () => {
  const tx = {} as Prisma.TransactionClient;

  it('lets an operation outside the frozen manifest submit on its own output hold', async () => {
    assertWorkflowExecutionAdmission.mockResolvedValue(
      workflowFundingFixture(),
    );
    const lipSync = workflowGenerationOperationId(
      'execution-a',
      'lips',
      'lipSync',
    );

    await expect(
      runWithWorkflowGenerationDispatch(dispatch(lipSync), () =>
        recordFundedWorkflowSubmissionIntent(
          service(),
          tx,
          'execution-a',
          'org-a',
        ),
      ),
    ).resolves.toBeUndefined();
    expect(assertWorkflowExecutionAdmission).toHaveBeenCalledWith(
      tx,
      'execution-a',
      'org-a',
    );
  });

  it('still fences a manifest operation that dispatches without its funded fingerprint', async () => {
    const funding = workflowFundingFixture();
    assertWorkflowExecutionAdmission.mockResolvedValue(funding);
    const allocated = funding.manifest.allocations[0]?.operationId ?? '';

    await expect(
      runWithWorkflowGenerationDispatch(dispatch(allocated), () =>
        recordFundedWorkflowSubmissionIntent(
          service(),
          tx,
          'execution-a',
          'org-a',
        ),
      ),
    ).rejects.toThrow(
      'Workflow dispatch differs from its funded provider plan',
    );
  });

  it('refuses a submission outside a dispatch scope', async () => {
    await expect(
      recordFundedWorkflowSubmissionIntent(
        service(),
        tx,
        'execution-a',
        'org-a',
      ),
    ).rejects.toThrow('Workflow dispatch context is unavailable');
  });
});
