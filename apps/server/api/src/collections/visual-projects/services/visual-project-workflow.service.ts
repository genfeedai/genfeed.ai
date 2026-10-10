import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { VisualProjectAssetsService } from '@api/collections/visual-projects/services/visual-project-assets.service';
import { VisualProjectAuthoringService } from '@api/collections/visual-projects/services/visual-project-authoring.service';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import { VisualProjectDispatchService } from '@api/collections/visual-projects/services/visual-project-dispatch.service';
import { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import {
  buildVisualProjectFailureWorkflowDefinition,
  buildVisualProjectWorkflowDefinition,
} from '@api/collections/visual-projects/services/visual-project-workflow-definition';
import { visualSettingsSchema } from '@api/collections/visual-projects/utils/visual-code-validation.util';
import {
  type WorkflowNodeClaimLease,
  WorkflowNodeClaimLeaseLostError,
} from '@api/collections/workflows/services/workflow-node-claim.service';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  isProtectedSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VisualCodeStatus } from '@genfeedai/contracts';
import type {
  IVisualCodeReceipt,
  IVisualSandboxInput,
  IVisualSandboxResult,
} from '@genfeedai/contracts/interfaces';
import {
  type Prisma,
  toPrismaJson,
  type VisualRevision,
} from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import {
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';

const terminal = [
  VisualCodeStatus.COMPLETED,
  VisualCodeStatus.FAILED,
  VisualCodeStatus.CANCELLED,
] as string[];
const receiptSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'authoring',
    'inspection',
    'repair',
    'render',
    'quote',
    'settlement',
    'admission',
  ]),
  quote: z
    .custom<
      import('@genfeedai/contracts/interfaces').IVisualCodeQuoteSnapshot
    >()
    .optional(),
  state: z.enum(['started', 'confirmed', 'indeterminate']),
  boundCredits: z.number(),
  isResultApplied: z.boolean(),
  isAccepted: z.boolean().optional(),
  credits: z.number(),
  operatorCredits: z.number(),
  modelKey: z.string().optional(),
  sourceHash: z.string().optional(),
  providerCost: z.number().optional(),
  isByok: z.boolean().optional(),
  computeSeconds: z.number().optional(),
});
function receipts(revision: VisualRevision): IVisualCodeReceipt[] {
  return z.array(receiptSchema).parse(revision.receipts);
}
function actor(revision: VisualRevision): AuthenticatedUser {
  return {
    id: revision.userId,
    userId: revision.userId,
    organizationId: revision.organizationId,
    brandId: revision.brandId,
  };
}
type VisualExecutionOwnership = WorkflowNodeClaimLease & {
  abortSignal?: AbortSignal;
};
@Injectable()
export class VisualProjectWorkflowService implements OnModuleInit {
  private readonly ownership =
    new AsyncLocalStorage<VisualExecutionOwnership>();
  /** Shared system-principal lookup for both normal and failure binding proofs. */
  private readSystemWorkflowMirror(workflowId: string) {
    return crossOrgUnsafe(() =>
      this.prisma.workflow.findFirstOrThrow({
        where: {
          id: workflowId,
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          isDeleted: false,
        },
      }),
    );
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: SystemWorkflowRunnerService,
    private readonly authorization: VisualProjectAuthorizationService,
    private readonly authoring: VisualProjectAuthoringService,
    private readonly billing: VisualProjectBillingService,
    private readonly renderer: VisualProjectRendererClientService,
    private readonly assets: VisualProjectAssetsService,
    private readonly moduleAccess: OrganizationModuleAccessService,
    private readonly dispatch: VisualProjectDispatchService,
  ) {}
  onModuleInit(): void {
    this.workflows.registerWorkflow(buildVisualProjectWorkflowDefinition());
    this.workflows.registerAction(
      'visual-code.execute-internal',
      async (request) => this.enter(request),
    );
    this.workflows.registerWorkflow(
      buildVisualProjectFailureWorkflowDefinition(),
    );
    this.workflows.registerAction(
      'visual-code.fail-internal',
      async (request) => this.failAdmittedExecution(request),
    );
    this.workflows.registerTerminalFailure(
      'visual-code.execute',
      async ({ inputValues, organizationId }) =>
        this.settleUnreconciledExecution(inputValues, organizationId),
    );
  }

  /**
   * Last resort when the execute and failure graphs both failed (#6655). No
   * failure node lease exists to prove, so only the original execution's own
   * claims guard the stop; receipts that need recovery still refuse it.
   */
  private async settleUnreconciledExecution(
    inputValues: Record<string, unknown>,
    organizationId: string,
  ): Promise<void> {
    const job = z
      .strictObject({
        revisionId: z.string().min(1),
        organizationId: z.literal(organizationId),
        brandId: z.string().min(1),
        userId: z.string().min(1),
      })
      .parse(inputValues.job);
    const revision = await this.prisma.visualRevision.findFirst({
      where: {
        id: job.revisionId,
        organizationId,
        brandId: job.brandId,
        userId: job.userId,
        isDeleted: false,
      },
    });
    if (!revision || terminal.includes(revision.status)) return;
    const original = await this.prisma.workflowExecution.findFirst({
      where: {
        organizationId,
        userId: job.userId,
        idempotencyKey: `visual-code-${revision.id}`,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!original) return;
    await this.dispatch.reconcileFailedExecution(
      revision,
      original.id,
      async () => {},
    );
  }
  private async failAdmittedExecution({
    input,
    context,
    provenance,
  }: SystemWorkflowActionRequest) {
    const jobSchema = z.strictObject({
      revisionId: z.string().min(1),
      organizationId: z.string().min(1),
      brandId: z.string().min(1),
      userId: z.string().min(1),
    });
    const job = jobSchema.parse(input.job);
    const executionId = provenance.executionId;
    const nodeId = provenance.nodeId;
    if (
      nodeId !== 'fail' ||
      job.organizationId !== context.organizationId ||
      job.userId !== context.userId ||
      executionId !== (context.executionId ?? context.runId)
    )
      throw new ConflictException('visual_worker_scope_mismatch');
    const revision = await this.prisma.visualRevision.findFirstOrThrow({
      where: {
        id: job.revisionId,
        organizationId: job.organizationId,
        brandId: job.brandId,
        userId: job.userId,
        isDeleted: false,
      },
    });
    const failure = await this.prisma.workflowExecution.findFirstOrThrow({
      where: {
        id: executionId,
        organizationId: job.organizationId,
        userId: job.userId,
        isDeleted: false,
      },
      include: { workflowVersion: true },
    });
    const original = await this.prisma.workflowExecution.findFirstOrThrow({
      where: {
        organizationId: job.organizationId,
        userId: job.userId,
        idempotencyKey: `visual-code-${revision.id}`,
        isDeleted: false,
      },
      include: { workflowVersion: true },
    });
    const persisted = z
      .object({
        inputValues: z.object({ job: jobSchema }),
        metadata: z.object({
          canonicalId: z.literal('visual-code.failure'),
          source: z.literal('workflow-failure:visual-code.execute'),
          failedCanonicalId: z.literal('visual-code.execute'),
          failedJobId: z.literal(`system-workflow-${original.id}`),
        }),
      })
      .safeParse(failure.result);
    const admitted = z
      .object({
        inputValues: z.object({ job: jobSchema }),
        metadata: z.object({ canonicalId: z.literal('visual-code.execute') }),
      })
      .safeParse(original.result);
    const sameJob = (value: z.infer<typeof jobSchema>) =>
      value.revisionId === job.revisionId &&
      value.organizationId === job.organizationId &&
      value.brandId === job.brandId &&
      value.userId === job.userId;
    if (
      !persisted.success ||
      !admitted.success ||
      !sameJob(persisted.data.inputValues.job) ||
      !sameJob(admitted.data.inputValues.job) ||
      failure.id === original.id ||
      (revision.workflowExecutionId &&
        revision.workflowExecutionId !== original.id)
    )
      throw new ConflictException('visual_worker_binding_invalid');
    for (const [execution, definition] of [
      [failure, buildVisualProjectFailureWorkflowDefinition()],
      [original, buildVisualProjectWorkflowDefinition()],
    ] as const) {
      const mirror = await this.readSystemWorkflowMirror(execution.workflowId);
      if (
        !isHiddenSystemWorkflowMetadata(mirror.metadata) ||
        !isProtectedSystemWorkflowMetadata(mirror.metadata) ||
        getSystemWorkflowMetadata(mirror.metadata)?.canonicalId !==
          definition.canonicalId ||
        execution.workflowVersion.workflowId !== execution.workflowId ||
        execution.workflowVersion.contentHash !==
          buildWorkflowVersionDefinition(definition.definition).contentHash
      )
        throw new ConflictException('visual_worker_binding_invalid');
    }
    const lease = await this.prisma.workflowNodeClaim.findFirst({
      where: {
        organizationId: job.organizationId,
        executionId,
        nodeId,
        status: 'running',
        leaseExpiresAt: { gt: new Date() },
      },
    });
    if (!lease?.leaseOwnerId || context.abortSignal?.aborted)
      throw new WorkflowNodeClaimLeaseLostError({ executionId, nodeId });
    return this.ownership.run(
      {
        executionId,
        nodeId,
        organizationId: job.organizationId,
        leaseOwnerId: lease.leaseOwnerId,
        abortSignal: context.abortSignal,
      },
      async () => {
        // This grants only terminal reconciliation of the proved admitted job.
        // Public cancellation and new work retain fresh brand/actor authorization.
        await this.dispatch.reconcileFailedExecution(
          revision,
          original.id,
          () => this.assertOwnership(),
        );
        const current = await this.current(revision);
        return { revisionId: current.id, status: current.status };
      },
    );
  }
  private async enter({
    input,
    context,
    provenance,
  }: SystemWorkflowActionRequest) {
    const job = z
      .strictObject({
        revisionId: z.string(),
        organizationId: z.string(),
        brandId: z.string(),
        userId: z.string(),
      })
      .parse(input.job);
    const executionId = provenance.executionId;
    const nodeId = provenance.nodeId;
    if (
      !nodeId ||
      job.organizationId !== context.organizationId ||
      job.userId !== context.userId ||
      executionId !== (context.executionId ?? context.runId)
    )
      throw new ConflictException('visual_worker_scope_mismatch');
    const revision = await this.prisma.visualRevision.findFirstOrThrow({
      where: {
        id: job.revisionId,
        organizationId: job.organizationId,
        brandId: job.brandId,
        userId: job.userId,
        isDeleted: false,
      },
    });
    const execution = await this.prisma.workflowExecution.findFirstOrThrow({
      where: {
        id: executionId,
        organizationId: job.organizationId,
        userId: job.userId,
        isDeleted: false,
        idempotencyKey: `visual-code-${revision.id}`,
      },
      include: { workflowVersion: true },
    });
    // The hidden system workflow mirror is platform-global (owned by the
    // system principal), so this binding check reads it as an explicit
    // cross-org operation.
    const mirror = await this.readSystemWorkflowMirror(execution.workflowId);
    const canonical = getSystemWorkflowMetadata(mirror.metadata);
    const result = z
      .object({
        metadata: z
          .object({ canonicalId: z.literal('visual-code.execute') })
          .passthrough(),
      })
      .passthrough()
      .safeParse(execution.result);
    if (
      !result.success ||
      !isHiddenSystemWorkflowMetadata(mirror.metadata) ||
      !isProtectedSystemWorkflowMetadata(mirror.metadata) ||
      canonical?.canonicalId !== 'visual-code.execute' ||
      execution.workflowVersion.workflowId !== execution.workflowId ||
      execution.workflowVersion.contentHash !==
        buildWorkflowVersionDefinition(
          buildVisualProjectWorkflowDefinition().definition,
        ).contentHash
    )
      throw new ConflictException('visual_worker_binding_invalid');
    const lease = await this.prisma.workflowNodeClaim.findFirst({
      where: {
        organizationId: job.organizationId,
        executionId,
        nodeId,
        status: 'running',
        leaseExpiresAt: { gt: new Date() },
      },
    });
    if (!lease?.leaseOwnerId || context.abortSignal?.aborted)
      throw new WorkflowNodeClaimLeaseLostError({ executionId, nodeId });
    const bound = await this.prisma.visualRevision.updateMany({
      where: {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
        userId: job.userId,
        OR: [
          { workflowExecutionId: null },
          { workflowExecutionId: executionId },
        ],
      },
      data: { workflowExecutionId: executionId },
    });
    if (bound.count !== 1)
      throw new ConflictException('visual_worker_binding_invalid');
    return this.ownership.run(
      {
        executionId,
        nodeId,
        organizationId: job.organizationId,
        leaseOwnerId: lease.leaseOwnerId,
        abortSignal: context.abortSignal,
      },
      () => this.execute(revision.id, job.organizationId, job.brandId),
    );
  }
  private async assertOwnership(): Promise<void> {
    const owner = this.ownership.getStore();
    if (!owner) throw new ConflictException('visual_worker_binding_required');
    const active =
      !owner.abortSignal?.aborted &&
      (await this.prisma.workflowNodeClaim.findFirst({
        where: {
          organizationId: owner.organizationId,
          executionId: owner.executionId,
          nodeId: owner.nodeId,
          leaseOwnerId: owner.leaseOwnerId,
          status: 'running',
          leaseExpiresAt: { gt: new Date() },
        },
      }));
    if (!active) throw new WorkflowNodeClaimLeaseLostError(owner);
  }
  private async current(revision: VisualRevision) {
    await this.assertOwnership();
    return this.prisma.visualRevision.findFirstOrThrow({
      where: {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
      },
    });
  }
  private async update(
    revision: VisualRevision,
    data: Prisma.VisualRevisionUpdateManyMutationInput,
  ) {
    await this.assertOwnership();
    await this.prisma.visualRevision.updateMany({
      where: {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
      },
      data,
    });
    return this.current(revision);
  }
  private async replaceReceipt(
    revision: VisualRevision,
    value: IVisualCodeReceipt,
    data: Prisma.VisualRevisionUpdateManyMutationInput = {},
  ) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await this.current(revision);
      const prior = receipts(current);
      const next = prior.filter((item) => item.id !== value.id);
      next.push(value);
      const consumedCredits = next.reduce(
        (sum, item) =>
          sum +
          (['quote', 'settlement', 'admission'].includes(item.kind)
            ? 0
            : item.credits),
        0,
      );
      await this.assertOwnership();
      const updated = await this.prisma.visualRevision.updateMany({
        where: {
          id: revision.id,
          organizationId: revision.organizationId,
          brandId: revision.brandId,
          isDeleted: false,
          receipts: { equals: toPrismaJson(prior) },
        },
        data: { ...data, receipts: toPrismaJson(next), consumedCredits },
      });
      if (updated.count === 1) return this.current(revision);
    }
    throw new ConflictException('visual_execution_busy');
  }
  private async ensureActive(
    revision: VisualRevision,
  ): Promise<VisualRevision> {
    const current = await this.current(revision);
    await this.authorization.authorizeBrand(actor(current), current.brandId);
    if (current.cancelRequestedAt) throw new Error('visual_cancelled');
    if (terminal.includes(current.status)) throw new Error('visual_terminal');
    await this.moduleAccess.assertAccess(current.organizationId, 'motion');
    return current;
  }
  private async call(
    revision: VisualRevision,
    id: string,
    kind: 'authoring' | 'repair' | 'inspection',
    diagnostics: string[],
    frames?: IVisualSandboxResult['media'],
  ) {
    const current = await this.ensureActive(revision);
    const existing = receipts(current).find((item) => item.id === id);
    if (existing) {
      if (existing.state === 'started') {
        await this.replaceReceipt(current, {
          ...existing,
          state: 'indeterminate',
          operatorCredits: existing.boundCredits,
        });
        throw new Error('provider_call_indeterminate');
      }
      if (!existing.isResultApplied)
        throw new Error('provider_result_unavailable');
      return current;
    }
    const quote = await this.billing.validateSnapshot(current);
    const bound =
      kind === 'inspection'
        ? quote.inspectionCredits / quote.maximumInspectionCalls
        : quote.authoringCredits / Math.max(1, quote.maximumAuthoringCalls);
    if (bound > current.maximumCredits - current.consumedCredits + 1e-9)
      throw new Error('visual_credit_ceiling');
    const params =
      kind === 'inspection'
        ? await this.authoring.inspectionParameters(current, frames ?? [])
        : await this.authoring.authorParameters(current, diagnostics);
    // Preparation can outlive the admission that began this action. Deny
    // before creating a started receipt, so no unsubmitted call looks spent.
    await this.ensureActive(current);
    const started: IVisualCodeReceipt = {
      id,
      kind,
      state: 'started',
      boundCredits: bound,
      isResultApplied: false,
      credits: 0,
      operatorCredits: 0,
      modelKey: current.modelKey ?? undefined,
      sourceHash: current.sourceHash ?? undefined,
      isByok: quote.isByok,
    };
    const previous = receipts(current);
    await this.assertOwnership();
    const claimed = await this.prisma.visualRevision.updateMany({
      where: {
        id: current.id,
        organizationId: current.organizationId,
        brandId: current.brandId,
        isDeleted: false,
        receipts: { equals: toPrismaJson(previous) },
        cancelRequestedAt: null,
        status: { notIn: terminal },
      },
      data: {
        receipts: toPrismaJson([...previous, started]),
        status:
          kind === 'inspection'
            ? VisualCodeStatus.CHECKING
            : VisualCodeStatus.AUTHORING,
      },
    });
    if (claimed.count !== 1)
      throw new ConflictException('visual_execution_busy');
    let response: Awaited<ReturnType<VisualProjectAuthoringService['call']>>;
    try {
      response = await this.authoring.call(current, params, {
        modelKey: quote.modelKey,
        provider: z
          .enum(['anthropic', 'openai', 'openrouter', 'local'])
          .parse(quote.provider),
        isByok: quote.isByok,
        isAvailable: true,
      });
    } catch (error) {
      if (error instanceof WorkflowNodeClaimLeaseLostError) throw error;
      await this.assertOwnership();
      await this.replaceReceipt(current, {
        ...started,
        state:
          error instanceof Error &&
          ['quote_changed', 'route_unavailable'].includes(error.message)
            ? 'confirmed'
            : 'indeterminate',
        isResultApplied: true,
        operatorCredits:
          error instanceof Error &&
          ['quote_changed', 'route_unavailable'].includes(error.message)
            ? 0
            : bound,
      });
      if (
        error instanceof Error &&
        ['quote_changed', 'route_unavailable'].includes(error.message)
      )
        throw error;
      throw new Error(
        kind === 'inspection'
          ? 'visual_check_unavailable'
          : 'provider_call_indeterminate',
        { cause: error },
      );
    }
    return this.applyProviderResult(current, started, response, kind);
  }
  private async applyProviderResult(
    current: VisualRevision,
    started: IVisualCodeReceipt,
    response: Awaited<ReturnType<VisualProjectAuthoringService['call']>>,
    kind: 'authoring' | 'repair' | 'inspection',
  ) {
    await this.assertOwnership();
    const actual = await this.billing.actualCredits(
      current.modelKey ?? '',
      response.model,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      response.usage.cost,
      response.usage.is_byok === true,
    );
    current = await this.current(current);
    const remaining = Math.max(
      0,
      current.maximumCredits - current.consumedCredits,
    );
    const confirmed: IVisualCodeReceipt = {
      ...started,
      state: 'confirmed',
      credits: Math.min(actual, remaining),
      operatorCredits: Math.max(0, actual - remaining),
      providerCost: response.usage.cost,
      isByok: response.usage.is_byok === true,
    };
    current = await this.replaceReceipt(current, confirmed);
    if (actual > remaining + 1e-9)
      throw new Error('visual_provider_cost_overrun');
    if (current.cancelRequestedAt) throw new Error('visual_cancelled');
    if (kind === 'inspection') {
      const inspection = this.authoring.parseInspection(response);
      return this.replaceReceipt(
        current,
        {
          ...confirmed,
          isResultApplied: true,
          isAccepted: inspection.isAccepted,
        },
        { diagnostics: toPrismaJson(inspection.issues) },
      );
    }
    const sourceCode = this.authoring.parseSource(response);
    return this.replaceReceipt(
      current,
      { ...confirmed, isResultApplied: true },
      {
        sourceCode,
        sourceHash: createHash('sha256').update(sourceCode).digest('hex'),
        diagnostics: toPrismaJson([]),
      },
    );
  }
  private async render(
    revision: VisualRevision,
    attempt: number,
    mode: 'preview' | 'export',
  ) {
    let current = await this.ensureActive(revision);
    if (!current.sourceCode || !current.sourceHash)
      throw new Error('source_unavailable');
    const id = `${current.id}-${attempt}-${mode}-${current.sourceHash}`;
    const prior = receipts(current).find((item) => item.id === id);
    const quote = await this.billing.validateSnapshot(current);
    const rate = quote.creditsPerSecond;
    const bound = 120 * rate;
    if (
      !prior &&
      bound > current.maximumCredits - current.consumedCredits + 1e-9
    )
      throw new Error('visual_credit_ceiling');
    const staged = await this.assets.stage(actor(current), current);
    current = await this.ensureActive(current);
    if (!current.sourceCode || !current.sourceHash)
      throw new Error('source_unavailable');
    if (!prior) {
      const previous = receipts(current);
      await this.assertOwnership();
      const started: IVisualCodeReceipt = {
        id,
        kind: 'render',
        state: 'started',
        isResultApplied: false,
        boundCredits: bound,
        credits: 0,
        operatorCredits: 0,
        sourceHash: current.sourceHash,
      };
      const claimed = await this.prisma.visualRevision.updateMany({
        where: {
          id: current.id,
          organizationId: current.organizationId,
          brandId: current.brandId,
          isDeleted: false,
          receipts: { equals: toPrismaJson(previous) },
          status: { notIn: terminal },
          cancelRequestedAt: null,
        },
        data: { receipts: toPrismaJson([...previous, started]) },
      });
      if (claimed.count !== 1)
        throw new ConflictException('visual_execution_busy');
      current = await this.current(current);
    }
    if (!current.sourceCode || !current.sourceHash)
      throw new Error('source_unavailable');
    await this.assertOwnership();
    const input: IVisualSandboxInput = {
      id,
      sourceCode: current.sourceCode,
      settings: visualSettingsSchema.parse(current.settings),
      props: z.record(z.string(), z.json()).parse(current.props),
      assets: staged,
      outputs: z
        .array(
          z.object({
            format: z.enum(['mp4', 'png', 'jpeg']),
            frame: z.number().optional(),
          }),
        )
        .parse(current.outputRequests),
      mode,
    };
    const execution = await this.renderer.execute(input, async () =>
      Boolean((await this.current(current)).cancelRequestedAt),
    );
    await this.assertOwnership();
    const actual = execution.receipt.isComputeIndeterminate
      ? 0
      : execution.receipt.computeSeconds * rate;
    if (!prior || prior.state === 'started') {
      const remaining = Math.max(
        0,
        current.maximumCredits - current.consumedCredits,
      );
      current = await this.replaceReceipt(current, {
        id,
        kind: 'render',
        state: execution.receipt.isComputeIndeterminate
          ? 'indeterminate'
          : 'confirmed',
        isResultApplied: true,
        boundCredits: bound,
        credits: Math.min(actual, remaining),
        operatorCredits: execution.receipt.isComputeIndeterminate
          ? bound
          : Math.max(0, actual - remaining),
        computeSeconds: execution.receipt.computeSeconds,
        sourceHash: current.sourceHash ?? undefined,
      });
    }
    await this.ensureActive(current);
    if (execution.result?.diagnostics.length) {
      await this.update(current, {
        diagnostics: toPrismaJson(execution.result.diagnostics),
      });
      throw new Error('visual_compile_failed');
    }
    if (execution.receipt.status !== 'completed' || !execution.result)
      throw new Error(execution.receipt.diagnostic ?? 'visual_render_failed');
    if (mode === 'preview') {
      const previews = await this.assets.previews(
        actor(current),
        current,
        execution.result.media,
        attempt,
      );
      await this.update(current, {
        preview: toPrismaJson(previews),
        progress: 35 + attempt * 15,
      });
    }
    return execution.result;
  }
  private async execute(id: string, organizationId: string, brandId: string) {
    await this.assertOwnership();
    let revision = await this.prisma.visualRevision.findFirstOrThrow({
      where: { id, organizationId, brandId, isDeleted: false },
    });
    if (terminal.includes(revision.status)) {
      await this.billing.reconcileStopped(revision, () =>
        this.assertOwnership(),
      );
      return { revisionId: id, status: revision.status };
    }
    try {
      await this.ensureActive(revision);
      let attempt = receipts(revision).filter(
        (item) => item.kind === 'repair' && item.isResultApplied,
      ).length;
      if (
        revision.prompt &&
        !receipts(revision).some(
          (item) => item.id === 'author-0' && item.isResultApplied,
        )
      )
        revision = await this.call(revision, 'author-0', 'authoring', []);
      for (;;) {
        revision = await this.current(revision);
        const inspectionId = `inspect-${attempt}`;
        let inspection = receipts(revision).find(
          (item) => item.id === inspectionId,
        );
        if (!inspection?.isResultApplied) {
          try {
            const preview = await this.render(revision, attempt, 'preview');
            revision = await this.call(
              revision,
              inspectionId,
              'inspection',
              [],
              preview.media,
            );
            inspection = receipts(revision).find(
              (item) => item.id === inspectionId,
            );
          } catch (error) {
            if (
              error instanceof Error &&
              [
                'visual_render_failed',
                'render_failed',
                'visual_compile_failed',
              ].includes(error.message) &&
              revision.prompt &&
              attempt < 2
            ) {
              revision = await this.current(revision);
              attempt++;
              revision = await this.call(
                revision,
                `author-${attempt}`,
                'repair',
                z.array(z.string()).parse(revision.diagnostics),
              );
              continue;
            }
            throw error;
          }
        }
        if (inspection?.isAccepted) break;
        if (!revision.prompt || attempt >= 2)
          throw new Error('visual_check_rejected');
        attempt++;
        revision = await this.call(
          revision,
          `author-${attempt}`,
          'repair',
          z.array(z.string()).parse(revision.diagnostics),
        );
      }
      revision = await this.update(revision, {
        status: VisualCodeStatus.RENDERING,
        progress: 85,
      });
      const result = await this.render(revision, attempt, 'export');
      revision = await this.ensureActive(revision);
      const outputs = await this.assets.commit(
        actor(revision),
        revision,
        result.media,
        () => this.assertOwnership(),
      );
      await this.authorization.authorizeBrand(
        actor(revision),
        revision.brandId,
      );
      revision = await this.update(revision, {
        outputs: toPrismaJson(outputs),
        status: VisualCodeStatus.COMPLETED,
        progress: 100,
      });
    } catch (error) {
      if (error instanceof WorkflowNodeClaimLeaseLostError) throw error;
      await this.assertOwnership();
      revision = await this.current(revision);
      const code =
        error instanceof Error && /^[a-z_]+$/.test(error.message)
          ? error.message
          : 'visual_execution_failed';
      revision = await this.update(revision, {
        status: terminal.includes(revision.status)
          ? revision.status
          : revision.cancelRequestedAt
            ? VisualCodeStatus.CANCELLED
            : VisualCodeStatus.FAILED,
        diagnostics: toPrismaJson([
          ...z.array(z.string()).parse(revision.diagnostics).slice(0, 7),
          code,
        ]),
      });
    }
    await this.billing.reconcileStopped(revision, () => this.assertOwnership());
    return { revisionId: id, status: revision.status };
  }
}
