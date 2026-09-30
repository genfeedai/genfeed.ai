import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { VisualProjectAssetsService } from '@api/collections/visual-projects/services/visual-project-assets.service';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import {
  parseCreate,
  parseExport,
  parseRetry,
  parseRevision,
  visualInputHash,
  visualSettingsSchema,
} from '@api/collections/visual-projects/utils/visual-code-validation.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VISUAL_CODE_ACTION_ALIASES } from '@genfeedai/actions';
import { VisualCodeStatus } from '@genfeedai/contracts';
import {
  VISUAL_CODE_LIMITS,
  VISUAL_CODE_RENDERER_VERSION,
} from '@genfeedai/contracts/constants';
import type { IVisualCodeReceipt } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { toPrismaJson, type VisualRevision } from '@genfeedai/prisma';
import {
  visualCodeQuoteAttributes,
  visualProjectData,
} from '@genfeedai/serializers';
import {
  BadRequestException,
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
@Injectable()
export class VisualProjectsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: VisualProjectAuthorizationService,
    private readonly assets: VisualProjectAssetsService,
    private readonly billing: VisualProjectBillingService,
    private readonly workflows: SystemWorkflowRunnerService,
    private readonly queue: WorkflowExecutionQueueService,
  ) {}
  onModuleInit(): void {
    for (const [alias, operation] of Object.entries(
      VISUAL_CODE_ACTION_ALIASES,
    )) {
      for (const actionId of [alias, `visual-code.${operation}`]) {
        this.workflows.registerAction(
          actionId,
          async ({ input, context, provenance }) => {
            const user: AuthenticatedUser = {
              id: context.userId,
              userId: context.userId,
              organizationId: context.organizationId,
              brandId: z.string().min(1).parse(context.brandId),
            };
            const execution =
              await this.prisma.workflowExecution.findFirstOrThrow({
                where: {
                  id: provenance.executionId,
                  organizationId: context.organizationId,
                  userId: context.userId,
                  isDeleted: false,
                },
                select: { result: true },
              });
            const metadata = z
              .object({
                metadata: z
                  .object({ dispatchClass: z.string().optional() })
                  .passthrough(),
              })
              .passthrough()
              .safeParse(execution.result);
            const dispatchClass =
              metadata.success &&
              metadata.data.metadata.dispatchClass ===
                SystemWorkflowDispatchClass.INTERACTIVE
                ? SystemWorkflowDispatchClass.INTERACTIVE
                : SystemWorkflowDispatchClass.BACKGROUND;
            const data = await this.action(
              operation,
              user,
              input,
              JSON.stringify(provenance),
              dispatchClass,
            );
            return actionId === alias
              ? {
                  success: true,
                  creditsUsed: 0,
                  isBillingDelegated: true,
                  data,
                }
              : data;
          },
        );
      }
    }
  }
  handlesAction(name: string): boolean {
    return Object.hasOwn(VISUAL_CODE_ACTION_ALIASES, name);
  }
  async executeAgentAction(
    name: string,
    parameters: Record<string, unknown>,
    context: {
      organizationId: string;
      userId: string;
      brandId?: string;
      sourceActionId?: string;
      isProactive?: boolean;
      runId?: string;
    },
  ) {
    const operation =
      VISUAL_CODE_ACTION_ALIASES[
        name as keyof typeof VISUAL_CODE_ACTION_ALIASES
      ];
    const user: AuthenticatedUser = {
      id: context.userId,
      userId: context.userId,
      organizationId: context.organizationId,
      brandId: z.string().min(1).parse(context.brandId),
    };
    const data = await this.action(
      operation,
      user,
      parameters,
      context.sourceActionId ?? context.runId,
      context.isProactive
        ? SystemWorkflowDispatchClass.BACKGROUND
        : SystemWorkflowDispatchClass.INTERACTIVE,
    );
    return { success: true, creditsUsed: 0, isBillingDelegated: true, data };
  }
  private async action(
    operation: string,
    user: AuthenticatedUser,
    raw: Record<string, unknown>,
    provenance: string | undefined,
    dispatchClass: SystemWorkflowDispatchClass,
  ): Promise<Record<string, unknown>> {
    const params = { ...raw };
    if (
      ['generate', 'revise', 'export', 'retry'].includes(operation) &&
      params.requestId === undefined
    ) {
      if (!provenance)
        throw new BadRequestException('request_identity_required');
      params.requestId = createHash('sha256')
        .update(JSON.stringify([operation, user.organizationId, provenance]))
        .digest('hex');
    }
    if (operation === 'catalog')
      return {
        ...(await this.catalog(user, z.string().min(1).parse(params.brandId))),
      };
    if (operation === 'quote') {
      const quote = await this.quote(user, params);
      return Object.fromEntries(
        visualCodeQuoteAttributes.map((key) => [
          key,
          quote[key as keyof typeof quote],
        ]),
      );
    }
    if (operation === 'generate')
      return visualProjectData(await this.create(user, params, dispatchClass));
    const projectId = z.string().min(1).parse(params.projectId);
    delete params.projectId;
    const project = await this.authorization.project(user, projectId);
    if (user.brandId && project.brandId !== user.brandId)
      throw new BadRequestException('visual_brand_scope_mismatch');
    if (operation === 'status')
      return visualProjectData(
        await this.get(
          user,
          projectId,
          params.beforeRevision === undefined
            ? undefined
            : z.number().int().positive().parse(params.beforeRevision),
          params.limit === undefined
            ? 50
            : z.number().int().min(1).max(50).parse(params.limit),
        ),
      );
    if (operation === 'cancel')
      return visualProjectData(await this.cancel(user, projectId, params));
    if (
      operation === 'revise' ||
      operation === 'export' ||
      operation === 'retry'
    )
      return visualProjectData(
        await this.mutate(user, projectId, operation, params, dispatchClass),
      );
    throw new BadRequestException('unknown_visual_action');
  }
  async catalog(user: AuthenticatedUser, brandId: string) {
    await this.authorization.authorizeBrand(user, brandId);
    return this.billing.catalog(user.organizationId);
  }
  async get(
    user: AuthenticatedUser,
    id: string,
    beforeRevision?: number,
    limit = 50,
  ) {
    const project = await this.authorization.project(user, id);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (beforeRevision !== undefined &&
        (!Number.isInteger(beforeRevision) || beforeRevision < 1))
    )
      throw new BadRequestException('invalid_pagination');
    const revisions = await this.prisma.visualRevision.findMany({
      where: {
        projectId: id,
        organizationId: user.organizationId,
        brandId: project.brandId,
        isDeleted: false,
        ...(beforeRevision ? { number: { lt: beforeRevision } } : {}),
      },
      orderBy: { number: 'desc' },
      take: limit + 1,
    });
    return {
      ...project,
      revisions: revisions.slice(0, limit),
      nextRevisionCursor:
        revisions.length > limit ? revisions[limit - 1].number : null,
    };
  }
  async list(
    user: AuthenticatedUser,
    brandId: string,
    limit = 20,
    cursor?: string,
  ) {
    await this.authorization.authorizeBrand(user, brandId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException('invalid_pagination');
    const anchor = cursor
      ? await this.authorization.project(user, cursor)
      : null;
    if (anchor && anchor.brandId !== brandId)
      throw new BadRequestException('invalid_cursor');
    const rows = await this.prisma.visualProject.findMany({
      where: {
        organizationId: user.organizationId,
        brandId,
        isDeleted: false,
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return {
      docs: await Promise.all(
        rows
          .slice(0, limit)
          .map((project) => this.get(user, project.id, undefined, 1)),
      ),
      hasMore: rows.length > limit,
      limit,
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }
  async source(
    user: AuthenticatedUser,
    id: string,
    number: number,
  ): Promise<string> {
    const revision = await this.authorization.revision(user, id, number);
    if (!revision.sourceCode) throw new ConflictException('source_unavailable');
    return revision.sourceCode;
  }
  async create(
    user: AuthenticatedUser,
    raw: unknown,
    dispatchClass = SystemWorkflowDispatchClass.INTERACTIVE,
  ) {
    const input = parseCreate(raw);
    await this.authorization.authorizeBrand(user, input.brandId);
    const inputHash = visualInputHash(input);
    const existing = await this.prisma.visualProject.findFirst({
      where: {
        organizationId: user.organizationId,
        brandId: input.brandId,
        requestId: input.requestId,
        isDeleted: false,
      },
    });
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new ConflictException('request_identity_conflict');
      const initial = await this.authorization.revision(user, existing.id, 1);
      if (
        terminal.includes(initial.status) &&
        !(initial.receipts as unknown as IVisualCodeReceipt[]).some(
          (entry) => entry.kind === 'settlement',
        )
      )
        await this.stopWithoutOwner(
          initial,
          Boolean(initial.cancelRequestedAt),
        );
      if (
        initial.status === VisualCodeStatus.QUEUED &&
        !initial.cancelRequestedAt
      )
        await this.dispatch(initial, dispatchClass);
      return this.get(user, existing.id);
    }
    await this.assets.authorize(
      user,
      input.brandId,
      input.sourceAssetIds ?? [],
    );
    const quote = await this.billing.quote(
      user.organizationId,
      input.modelKey,
      Boolean(input.prompt),
      input.settings,
      input.outputs ?? [{ format: 'mp4' }],
    );
    if (input.maximumCredits < quote.maximumCredits)
      throw new BadRequestException('visual_credit_ceiling_below_quote');
    let revision: VisualRevision;
    try {
      revision = await runSerializableWithRetry(this.prisma, async (tx) => {
        const project = await tx.visualProject.create({
          data: {
            organizationId: user.organizationId,
            brandId: input.brandId,
            userId: user.userId,
            label: input.label,
            requestId: input.requestId,
            inputHash,
            currentRevision: 1,
          },
        });
        return tx.visualRevision.create({
          data: {
            organizationId: user.organizationId,
            brandId: input.brandId,
            userId: user.userId,
            projectId: project.id,
            number: 1,
            requestId: input.requestId,
            inputHash,
            prompt: input.prompt,
            sourceCode: input.sourceCode,
            sourceHash: input.sourceCode
              ? createHash('sha256').update(input.sourceCode).digest('hex')
              : null,
            receipts: toPrismaJson([this.billing.quoteReceipt(quote)]),
            modelKey: quote.modelKey,
            rendererVersion: VISUAL_CODE_RENDERER_VERSION,
            settings: toPrismaJson(input.settings),
            props: toPrismaJson(input.props ?? {}),
            sourceAssetIds: toPrismaJson(input.sourceAssetIds ?? []),
            outputRequests: toPrismaJson(input.outputs ?? [{ format: 'mp4' }]),
            status: VisualCodeStatus.QUEUED,
            maximumCredits: input.maximumCredits,
          },
        });
      });
    } catch (error) {
      const replay = await this.prisma.visualProject.findFirst({
        where: {
          organizationId: user.organizationId,
          brandId: input.brandId,
          requestId: input.requestId,
          isDeleted: false,
        },
      });
      if (!replay) throw error;
      if (replay.inputHash !== inputHash)
        throw new ConflictException('request_identity_conflict');
      const initial = await this.authorization.revision(user, replay.id, 1);
      if (
        terminal.includes(initial.status) &&
        !(initial.receipts as unknown as IVisualCodeReceipt[]).some(
          (entry) => entry.kind === 'settlement',
        )
      )
        await this.stopWithoutOwner(
          initial,
          Boolean(initial.cancelRequestedAt),
        );
      if (
        initial.status === VisualCodeStatus.QUEUED &&
        !initial.cancelRequestedAt
      )
        await this.dispatch(initial, dispatchClass);
      return this.get(user, replay.id);
    }
    await this.dispatch(revision, dispatchClass);
    return this.get(user, revision.projectId);
  }
  private async prepare(
    user: AuthenticatedUser,
    id: string,
    operation: 'revise' | 'export' | 'retry',
    raw: unknown,
  ) {
    const project = await this.authorization.project(user, id);
    const candidate = z
      .object({ revision: z.number().int().positive().optional() })
      .passthrough()
      .parse(raw);
    const prior = await this.authorization.revision(
      user,
      id,
      operation === 'revise'
        ? project.currentRevision
        : (candidate.revision ?? project.currentRevision),
    );
    const settings = visualSettingsSchema.parse(prior.settings);
    const input =
      operation === 'revise'
        ? parseRevision(raw)
        : operation === 'export'
          ? parseExport(raw, settings)
          : parseRetry(raw);
    if (project.currentRevision !== input.expectedRevision)
      throw new ConflictException('stale_visual_revision');
    const active = await this.prisma.visualRevision.findFirst({
      where: {
        projectId: id,
        organizationId: user.organizationId,
        brandId: project.brandId,
        isDeleted: false,
        status: { notIn: terminal },
      },
    });
    if (active) throw new ConflictException('visual_revision_in_progress');
    if (operation !== 'revise' && !prior.sourceCode)
      throw new ConflictException('source_unavailable');
    if (
      operation === 'retry' &&
      ![VisualCodeStatus.FAILED, VisualCodeStatus.CANCELLED].includes(
        prior.status as VisualCodeStatus,
      )
    )
      throw new ConflictException('revision_not_retryable');
    const request = parseRevision.bind(null);
    const changed = operation === 'revise' ? request(raw) : null;
    if (changed?.props !== undefined && !prior.sourceCode)
      throw new ConflictException('source_unavailable');
    const sourceAssetIds = z.array(z.string()).parse(prior.sourceAssetIds);
    await this.assets.authorize(user, project.brandId, sourceAssetIds);
    const outputRequests =
      operation === 'export'
        ? parseExport(raw, settings).outputs
        : z
            .array(
              z.object({
                format: z.enum(['mp4', 'png', 'jpeg']),
                frame: z.number().optional(),
              }),
            )
            .parse(prior.outputRequests);
    const quote = await this.billing.quote(
      user.organizationId,
      prior.modelKey ?? undefined,
      Boolean(changed?.prompt),
      settings,
      outputRequests,
    );
    return {
      project,
      prior,
      input,
      changed,
      settings,
      sourceAssetIds,
      outputRequests,
      quote,
    };
  }
  async quote(user: AuthenticatedUser, raw: unknown) {
    const envelope = z
      .discriminatedUnion('operation', [
        z.strictObject({
          operation: z.literal('create'),
          input: z.record(z.string(), z.unknown()),
        }),
        ...(['revise', 'export', 'retry'] as const).map((operation) =>
          z.strictObject({
            operation: z.literal(operation),
            projectId: z.string().min(1),
            input: z.record(z.string(), z.unknown()),
          }),
        ),
      ])
      .parse(raw);
    if (Object.hasOwn(envelope.input, 'maximumCredits'))
      throw new BadRequestException('quote_must_not_include_maximum_credits');
    if (envelope.operation === 'create') {
      const input = parseCreate({ ...envelope.input, maximumCredits: 0 });
      await this.authorization.authorizeBrand(user, input.brandId);
      await this.assets.authorize(
        user,
        input.brandId,
        input.sourceAssetIds ?? [],
      );
      return this.billing.quote(
        user.organizationId,
        input.modelKey,
        Boolean(input.prompt),
        input.settings,
        input.outputs ?? [{ format: 'mp4' }],
      );
    }
    return (
      await this.prepare(user, envelope.projectId, envelope.operation, {
        ...envelope.input,
        maximumCredits: 0,
      })
    ).quote;
  }
  async revise(
    user: AuthenticatedUser,
    id: string,
    raw: unknown,
    dispatchClass = SystemWorkflowDispatchClass.INTERACTIVE,
  ) {
    return this.mutate(user, id, 'revise', raw, dispatchClass);
  }
  async export(
    user: AuthenticatedUser,
    id: string,
    raw: unknown,
    dispatchClass = SystemWorkflowDispatchClass.INTERACTIVE,
  ) {
    return this.mutate(user, id, 'export', raw, dispatchClass);
  }
  async retry(
    user: AuthenticatedUser,
    id: string,
    raw: unknown,
    dispatchClass = SystemWorkflowDispatchClass.INTERACTIVE,
  ) {
    return this.mutate(user, id, 'retry', raw, dispatchClass);
  }
  private async mutate(
    user: AuthenticatedUser,
    id: string,
    operation: 'revise' | 'export' | 'retry',
    raw: unknown,
    dispatchClass: SystemWorkflowDispatchClass,
  ) {
    const project = await this.authorization.project(user, id);
    const requestId = z
      .object({ requestId: z.string().trim().min(1).max(128) })
      .passthrough()
      .parse(raw).requestId;
    const normalized =
      operation === 'revise'
        ? parseRevision(raw)
        : operation === 'retry'
          ? parseRetry(raw)
          : parseExport(
              raw,
              visualSettingsSchema.parse(
                (
                  await this.authorization.revision(
                    user,
                    id,
                    z
                      .object({ revision: z.number().int().positive() })
                      .passthrough()
                      .parse(raw).revision,
                  )
                ).settings,
              ),
            );
    const inputHash = visualInputHash({ operation, input: normalized });
    const existing = await this.prisma.visualRevision.findFirst({
      where: {
        projectId: id,
        organizationId: user.organizationId,
        brandId: project.brandId,
        isDeleted: false,
        requestId,
      },
    });
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new ConflictException('request_identity_conflict');
      if (
        terminal.includes(existing.status) &&
        !(existing.receipts as unknown as IVisualCodeReceipt[]).some(
          (entry) => entry.kind === 'settlement',
        )
      )
        await this.stopWithoutOwner(
          existing,
          Boolean(existing.cancelRequestedAt),
        );
      if (
        existing.status === VisualCodeStatus.QUEUED &&
        !existing.cancelRequestedAt
      )
        await this.dispatch(existing, dispatchClass);
      return this.get(user, id);
    }
    let dispatchAttempted = false;
    try {
      const prepared = await this.prepare(user, id, operation, raw);
      if (prepared.input.maximumCredits < prepared.quote.maximumCredits)
        throw new BadRequestException('visual_credit_ceiling_below_quote');
      const revision = await runSerializableWithRetry(
        this.prisma,
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM visual_projects WHERE id=${id} AND "organizationId"=${user.organizationId} AND "brandId"=${project.brandId} AND "isDeleted"=false FOR UPDATE`;
          const current = await tx.visualProject.findFirstOrThrow({
            where: {
              id,
              organizationId: user.organizationId,
              brandId: project.brandId,
              isDeleted: false,
            },
          });
          if (current.currentRevision !== prepared.input.expectedRevision)
            throw new ConflictException('stale_visual_revision');
          const active = await tx.visualRevision.count({
            where: {
              projectId: id,
              organizationId: user.organizationId,
              brandId: project.brandId,
              isDeleted: false,
              status: { notIn: terminal },
            },
          });
          if (active)
            throw new ConflictException('visual_revision_in_progress');
          const number = current.currentRevision + 1;
          const sourceCode =
            prepared.changed?.sourceCode ?? prepared.prior.sourceCode;
          const created = await tx.visualRevision.create({
            data: {
              organizationId: user.organizationId,
              brandId: project.brandId,
              userId: user.userId,
              projectId: id,
              number,
              requestId,
              inputHash,
              prompt: prepared.changed?.prompt ?? null,
              sourceCode,
              sourceHash: sourceCode
                ? createHash('sha256').update(sourceCode).digest('hex')
                : null,
              receipts: toPrismaJson([
                this.billing.quoteReceipt(prepared.quote),
              ]),
              modelKey: prepared.quote.modelKey,
              rendererVersion: VISUAL_CODE_RENDERER_VERSION,
              settings: toPrismaJson(prepared.prior.settings),
              props: toPrismaJson(
                prepared.changed?.props ?? prepared.prior.props,
              ),
              sourceAssetIds: toPrismaJson(prepared.prior.sourceAssetIds),
              outputRequests: toPrismaJson(prepared.outputRequests),
              maximumCredits: prepared.input.maximumCredits,
              status: VisualCodeStatus.QUEUED,
            },
          });
          await tx.visualProject.updateMany({
            where: {
              id,
              organizationId: user.organizationId,
              brandId: project.brandId,
              isDeleted: false,
              currentRevision: current.currentRevision,
            },
            data: { currentRevision: number },
          });
          return created;
        },
      );
      dispatchAttempted = true;
      await this.dispatch(revision, dispatchClass);
      return this.get(user, id);
    } catch (error) {
      if (dispatchAttempted) throw error;
      const replay = await this.prisma.visualRevision.findFirst({
        where: {
          projectId: id,
          organizationId: user.organizationId,
          brandId: project.brandId,
          isDeleted: false,
          requestId,
        },
      });
      if (!replay) throw error;
      if (replay.inputHash !== inputHash)
        throw new ConflictException('request_identity_conflict');
      if (
        terminal.includes(replay.status) &&
        !(replay.receipts as unknown as IVisualCodeReceipt[]).some(
          (entry) => entry.kind === 'settlement',
        )
      )
        await this.stopWithoutOwner(replay, Boolean(replay.cancelRequestedAt));
      if (
        replay.status === VisualCodeStatus.QUEUED &&
        !replay.cancelRequestedAt
      )
        await this.dispatch(replay, dispatchClass);
      return this.get(user, id);
    }
  }
  async cancel(user: AuthenticatedUser, id: string, raw: unknown) {
    const input = z
      .strictObject({ revision: z.number().int().positive() })
      .parse(raw);
    const project = await this.authorization.project(user, id);
    if (input.revision !== project.currentRevision)
      throw new ConflictException('stale_visual_revision');
    await this.prisma.visualRevision.updateMany({
      where: {
        projectId: id,
        number: input.revision,
        organizationId: user.organizationId,
        brandId: project.brandId,
        isDeleted: false,
        status: { notIn: terminal },
      },
      data: { cancelRequestedAt: new Date() },
    });
    const revision = await this.authorization.revision(
      user,
      id,
      input.revision,
    );
    if (revision.cancelRequestedAt) await this.stopWithoutOwner(revision, true);
    return this.get(user, id);
  }
  private async stopWithoutOwner(
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
            ...scope,
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
        where: scope,
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
          ...scope,
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
        await this.prisma.visualRevision.findFirstOrThrow({ where: scope }),
      );
    } catch (error) {
      await this.prisma.visualRevision.updateMany({
        where: scope,
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
        where: scope,
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
          ...scope,
          receipts: { equals: toPrismaJson(entries) },
          ...(!confirm
            ? { status: { notIn: terminal }, cancelRequestedAt: null }
            : {}),
        },
        data: { receipts: toPrismaJson(next) },
      });
      if (updated.count === 1)
        return { ...current, receipts: toPrismaJson(next) } as VisualRevision;
    }
    throw new ConflictException('visual_admission_retry_required');
  }
  private async dispatch(
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
          ...scope,
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
          ...scope,
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
        where: scope,
      });
      await this.stopWithoutOwner(latest, Boolean(latest.cancelRequestedAt));
      throw error;
    }
  }
}
