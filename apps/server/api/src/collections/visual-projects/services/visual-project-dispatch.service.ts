import { randomUUID } from 'node:crypto';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VisualCodeStatus } from '@genfeedai/contracts';
import { VISUAL_CODE_LIMITS } from '@genfeedai/contracts/constants';
import type { IVisualCodeReceipt } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { toPrismaJson, type VisualRevision } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

const terminal = [
  VisualCodeStatus.COMPLETED,
  VisualCodeStatus.FAILED,
  VisualCodeStatus.CANCELLED,
] as string[];
@Injectable()
export class VisualProjectDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: VisualProjectAuthorizationService,
    private readonly billing: VisualProjectBillingService,
    private readonly workflows: SystemWorkflowRunnerService,
    private readonly queue: WorkflowExecutionQueueService,
  ) {}
  /** Called only after the internal failure graph proves both immutable execution pins. */
  async reconcileFailedExecution(
    revision: VisualRevision,
    executionId: string,
    assertFailureOwnership: () => Promise<void>,
  ): Promise<void> {
    const scope = {
      id: revision.id,
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      userId: revision.userId,
      isDeleted: false,
    };
    const assertUnowned = async () => {
      await assertFailureOwnership();
      const live = await this.prisma.workflowNodeClaim.findFirst({
        where: {
          organizationId: revision.organizationId,
          executionId,
          status: 'running',
          leaseExpiresAt: { gt: new Date() },
        },
      });
      if (live) throw new ConflictException('visual_dispatch_owner_active');
    };
    await assertUnowned();
    const bound = await this.prisma.visualRevision.updateMany({
      where: {
        ...scope,
        OR: [
          { workflowExecutionId: null },
          { workflowExecutionId: executionId },
        ],
      },
      data: { workflowExecutionId: executionId },
    });
    if (bound.count !== 1)
      throw new ConflictException('visual_worker_binding_invalid');
    let current = await this.prisma.visualRevision.findFirstOrThrow({
      where: { ...scope },
    });
    const entries = current.receipts as unknown as IVisualCodeReceipt[];
    if (
      entries.some(
        (entry) =>
          !['quote', 'admission', 'settlement'].includes(entry.kind) &&
          (entry.state === 'started' || entry.state === 'indeterminate'),
      )
    )
      throw new ConflictException('visual_dispatch_recovery_required');
    await assertUnowned();
    current = await this.billing.recoverReservation(current, assertUnowned);
    await assertUnowned();
    const stopped = await this.prisma.visualRevision.updateMany({
      where: {
        ...scope,
        workflowExecutionId: executionId,
        status: current.status,
        receipts: { equals: toPrismaJson(current.receipts) },
      },
      data: {
        status: terminal.includes(current.status)
          ? current.status
          : current.cancelRequestedAt
            ? VisualCodeStatus.CANCELLED
            : VisualCodeStatus.FAILED,
        diagnostics: terminal.includes(current.status)
          ? toPrismaJson(current.diagnostics)
          : toPrismaJson([
              current.cancelRequestedAt
                ? 'visual_cancelled'
                : 'visual_dispatch_failed',
            ]),
      },
    });
    if (stopped.count !== 1)
      throw new ConflictException('visual_dispatch_state_changed');
    await this.billing.reconcileStopped(
      await this.prisma.visualRevision.findFirstOrThrow({
        where: { ...scope },
      }),
      assertUnowned,
    );
  }
  async stopWithoutOwner(
    revision: VisualRevision,
    cancelled: boolean,
  ): Promise<void> {
    const scope = {
      id: revision.id,
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      isDeleted: false,
    };
    await this.authorization.authorizeBrand(
      {
        id: revision.userId,
        userId: revision.userId,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
      },
      revision.brandId,
    );
    try {
      const execution = await this.prisma.workflowExecution.findFirst({
        where: {
          organizationId: revision.organizationId,
          userId: revision.userId,
          isDeleted: false,
          idempotencyKey: `visual-code-${revision.id}`,
        },
      });
      if (execution) {
        const binding = await this.prisma.visualRevision.updateMany({
          where: {
            id: scope.id,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
            OR: [
              { workflowExecutionId: null },
              { workflowExecutionId: execution.id },
            ],
          },
          data: { workflowExecutionId: execution.id },
        });
        if (binding.count !== 1)
          throw new ConflictException('visual_worker_binding_invalid');
        const withdrawal = await this.queue.withdrawUnstartedSystemWorkflowJob(
          `system-workflow-${execution.id}`,
        );
        if (withdrawal === 'started') return;
      } else if (revision.workflowExecutionId) {
        throw new ConflictException('visual_dispatch_state_unknown');
      }
      let current = await this.prisma.visualRevision.findFirstOrThrow({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
      });
      const live =
        execution &&
        (await this.prisma.workflowNodeClaim.findFirst({
          where: {
            organizationId: revision.organizationId,
            executionId: execution.id,
            status: 'running',
            leaseExpiresAt: { gt: new Date() },
          },
        }));
      if (live) return;
      current = await this.billing.recoverReservation(current);
      // Receipt CAS prevents terminating work admitted after the owner check.
      const stopped = await this.prisma.visualRevision.updateMany({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          receipts: { equals: toPrismaJson(current.receipts) },
          status: current.status,
        },
        data: {
          status: terminal.includes(current.status)
            ? current.status
            : cancelled
              ? VisualCodeStatus.CANCELLED
              : VisualCodeStatus.FAILED,
          diagnostics: terminal.includes(current.status)
            ? toPrismaJson(current.diagnostics)
            : toPrismaJson([
                cancelled ? 'visual_cancelled' : 'visual_dispatch_failed',
              ]),
        },
      });
      if (stopped.count !== 1)
        throw new ConflictException('visual_dispatch_state_changed');
      await this.billing.reconcileStopped(
        await this.prisma.visualRevision.findFirstOrThrow({
          where: {
            id: scope.id,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
          },
        }),
      );
    } catch (error) {
      await this.prisma.visualRevision.updateMany({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
        data: {
          diagnostics: toPrismaJson(['visual_dispatch_recovery_required']),
        },
      });
      throw error;
    }
  }
  private async admission(
    revision: VisualRevision,
    id: string,
    confirm = false,
  ): Promise<VisualRevision> {
    const scope = {
      id: revision.id,
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      isDeleted: false,
    };
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.prisma.visualRevision.findFirstOrThrow({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
      });
      const entries = current.receipts as unknown as IVisualCodeReceipt[];
      if (
        !confirm &&
        (terminal.includes(current.status) || current.cancelRequestedAt)
      )
        throw new ConflictException('visual_admission_cancelled');
      if (
        !confirm &&
        entries.filter((entry) => entry.kind === 'admission').length >=
          VISUAL_CODE_LIMITS.maxAdmissionAttempts
      )
        throw new ConflictException('visual_admission_attempt_limit');
      const next: IVisualCodeReceipt[] = confirm
        ? entries.map((entry) =>
            entry.id === id
              ? { ...entry, state: 'confirmed', isResultApplied: true }
              : entry,
          )
        : [
            ...entries,
            {
              id,
              kind: 'admission',
              state: 'started',
              isResultApplied: false,
              credits: 0,
              operatorCredits: 0,
              boundCredits: 0,
            },
          ];
      const updated = await this.prisma.visualRevision.updateMany({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          receipts: { equals: toPrismaJson(entries) },
          status: !confirm ? { notIn: terminal } : undefined,
          cancelRequestedAt: !confirm ? null : undefined,
        },
        data: { receipts: toPrismaJson(next) },
      });
      if (updated.count === 1)
        return { ...current, receipts: toPrismaJson(next) } as VisualRevision;
    }
    throw new ConflictException('visual_admission_retry_required');
  }
  async dispatch(
    revision: VisualRevision,
    dispatchClass: SystemWorkflowDispatchClass,
  ): Promise<void> {
    const scope = {
      id: revision.id,
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      isDeleted: false,
    };
    const admissionId = `admission-${randomUUID()}`;
    revision = await this.admission(revision, admissionId);
    let hasReservationResult = false;
    try {
      const reservationId = await this.billing.reserve(revision);
      hasReservationResult = true;
      const admitted = await this.prisma.visualRevision.updateMany({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          status: { notIn: terminal },
          cancelRequestedAt: null,
        },
        data: { reservationId },
      });
      if (admitted.count !== 1) {
        await this.admission(revision, admissionId, true);
        await this.stopWithoutOwner(revision, true);
        throw new ConflictException('visual_admission_cancelled');
      }
      const execution = await this.workflows.enqueueWorkflow(
        {
          canonicalId: 'visual-code.execute',
          actionType: 'visual-code.execute',
          source: 'visual-code',
          organizationId: revision.organizationId,
          userId: revision.userId,
          idempotencyKey: `visual-code-${revision.id}`,
          inputValues: {
            job: {
              revisionId: revision.id,
              organizationId: revision.organizationId,
              brandId: revision.brandId,
              userId: revision.userId,
            },
          },
        },
        { dispatchClass },
      );
      await this.prisma.visualRevision.updateMany({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          status: { notIn: terminal },
          cancelRequestedAt: null,
          OR: [
            { workflowExecutionId: null },
            { workflowExecutionId: execution.executionId },
          ],
        },
        data: { workflowExecutionId: execution.executionId },
      });
      await this.admission(revision, admissionId, true);
    } catch (error) {
      if (
        hasReservationResult ||
        (error instanceof BusinessLogicException &&
          error.errorCode === 'INSUFFICIENT_CREDITS')
      )
        await this.admission(revision, admissionId, true);
      const latest = await this.prisma.visualRevision.findFirstOrThrow({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
      });
      await this.stopWithoutOwner(latest, Boolean(latest.cancelRequestedAt));
      throw error;
    }
  }
}
