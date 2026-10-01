import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import {
  assertWorkflowAdmissionRequestMatch,
  captureWorkflowGenerationAdmissionSource,
  type WorkflowGenerationAdmissionCaptureInput,
} from '@api/collections/workflows/utils/workflow-generation-admission-capture.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';

/**
 * Persist a new execution with frozen admission evidence. Extracted from
 * WorkflowExecutionsService to stay under the runtime-complexity file-size
 * guard.
 */
export async function persistCreatedWorkflowExecutionWithAdmission(
  prisma: PrismaService,
  input: {
    admission: WorkflowGenerationAdmissionCaptureInput;
    data: Prisma.WorkflowExecutionUncheckedCreateInput;
    idempotencyKey?: string | null;
    organizationId: string;
  },
) {
  return runSerializableWithRetry(prisma, async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.workflowExecution.findFirst({
        where: {
          idempotencyKey: input.idempotencyKey,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
      if (existing) {
        assertWorkflowAdmissionRequestMatch(
          existing.generationAdmissionSource,
          input.admission,
        );
        return existing;
      }
    }
    const source = await captureWorkflowGenerationAdmissionSource(
      tx,
      input.admission,
    );
    return tx.workflowExecution.create({
      data: {
        ...input.data,
        ...(source ? { generationAdmissionSource: toPrismaJson(source) } : {}),
      },
    });
  });
}
