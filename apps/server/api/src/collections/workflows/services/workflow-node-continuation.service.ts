import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import { createWorkflowMediaCostIntent } from '@api/collections/workflows/services/workflow-media-cost-intent';
import {
  finishWorkflowContinuationSettlement,
  recordFundedWorkflowSubmissionIntent,
} from '@api/collections/workflows/services/workflow-node-continuation-billing.util';
import { mergeWorkflowProviderResult } from '@api/collections/workflows/services/workflow-provider-result.util';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getActionDefinition } from '@genfeedai/actions';
import { canReceiveProviderWebhooks } from '@genfeedai/config';
import { IngredientStatus } from '@genfeedai/contracts';
import {
  Prisma,
  WorkflowExecutionStatus as PrismaWorkflowExecutionStatus,
  WorkflowNodeContinuationStatus,
} from '@genfeedai/prisma';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

const RESUME_LEASE_MS = 5 * 60 * 1000;
const MEDIA_CALLBACK_ACTION_IDS = new Set([
  'aiAvatarVideo',
  'imageGen',
  'lipSync',
  'reframe',
  'upscale',
  'videoGen',
]);

type ContinuationRow = {
  actionId: string;
  completedAt: Date | null;
  creditsUsed: number;
  error: string | null;
  executionId: string;
  externalId: string | null;
  id: string;
  ingredientId: string;
  initialOutput: unknown;
  nodeId: string;
  organizationId: string;
  provider: string;
  providerResult: unknown;
  pollAttempt: number | null;
  pollDispatchClaimedAt: Date | null;
  pollDispatchedAt: Date | null;
  resumeClaimedAt: Date | null;
  status: WorkflowNodeContinuationStatus;
  updatedAt: Date;
  workflowVersionId: string;
};

export type ProviderContinuationIdentity =
  | { continuationId: string; organizationId: string }
  | { ingredientId: string; organizationId: string }
  | { externalId: string; organizationId: string };

export type ContinuationSettlement =
  | { kind: 'duplicate' | 'pending-output' }
  | {
      actionId: string;
      continuationId: string;
      creditsUsed: number;
      error?: string;
      executionId: string;
      finalOutput?: unknown;
      ingredientId: string;
      kind: 'claimed';
      nodeId: string;
      organizationId: string;
      workflowVersionId: string;
    };

export type AttachedContinuationOutput =
  | { kind: 'waiting' }
  | {
      continuationId: string;
      error?: string;
      finalOutput?: unknown;
      kind: 'provider-settled';
      succeeded: boolean;
    };

export type ContinuationReconciliationCandidate = {
  continuationId: string;
  error?: string;
  organizationId: string;
  provider: string;
  providerResult?: Record<string, unknown>;
  succeeded: boolean;
};

@Injectable()
export class WorkflowNodeContinuationService {
  private readonly logContext = 'WorkflowNodeContinuationService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly configService?: ConfigService,
    private readonly heygenPollQueueService?: HeygenPollQueueService,
    @Optional()
    private readonly generationBilling?: WorkflowGenerationBillingService,
  ) {}

  async createBeforeProviderSubmission(input: {
    model?: string;
    actionId: string;
    executionId: string;
    ingredientId: string;
    isByok?: boolean;
    nodeId: string;
    organizationId: string;
    provider: string;
    workflowVersionId: string;
  }): Promise<{ continuationId: string }> {
    this.assertProviderCallbackAction(input.actionId);

    const row = await this.prisma.$transaction(async (transaction) => {
      const execution = await transaction.workflowExecution.findFirst({
        select: { generationBilling: true, id: true },
        where: {
          id: input.executionId,
          isDeleted: false,
          organizationId: input.organizationId,
          workflowVersionId: input.workflowVersionId,
        },
      });
      if (!execution) {
        throw new Error(
          `Workflow continuation execution ${input.executionId} does not match organization/version`,
        );
      }

      const ingredient = await transaction.ingredient.findFirst({
        select: { id: true },
        where: {
          id: input.ingredientId,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
      if (!ingredient) {
        throw new Error(
          `Workflow continuation ingredient ${input.ingredientId} is outside organization ${input.organizationId}`,
        );
      }

      const existing = (await transaction.workflowNodeContinuation.findUnique({
        where: {
          executionId_nodeId: {
            executionId: input.executionId,
            nodeId: input.nodeId,
          },
        },
      })) as ContinuationRow | null;
      if (existing) {
        this.assertSameIdentity(existing, input);
        throw new Error(
          `Workflow continuation ${existing.id} already owns an ambiguous provider submission; automatic resubmission is forbidden`,
        );
      }

      const continuation = (await transaction.workflowNodeContinuation.create({
        data: {
          actionId: input.actionId,
          executionId: input.executionId,
          ingredientId: input.ingredientId,
          isByok: input.isByok ?? false,
          nodeId: input.nodeId,
          organizationId: input.organizationId,
          provider: input.provider,
          status: WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
          workflowVersionId: input.workflowVersionId,
        },
      })) as ContinuationRow;
      await createWorkflowMediaCostIntent(transaction, input, continuation.id);
      if (execution.generationBilling) {
        await recordFundedWorkflowSubmissionIntent(
          this.generationBilling,
          transaction,
          input.executionId,
          input.organizationId,
        );
      }
      return continuation;
    });

    return { continuationId: row.id };
  }

  async markProviderSubmitted(input: {
    continuationId: string;
    externalId: string;
    organizationId: string;
    completionQuantities?: {
      width?: number;
      height?: number;
      duration?: number;
    };
  }): Promise<void> {
    const webhookUrl = this.configService?.get('GENFEEDAI_WEBHOOKS_URL');
    const requiresPoll = !canReceiveProviderWebhooks(webhookUrl);
    await this.prisma.$transaction(async (transaction) => {
      const continuation =
        (await transaction.workflowNodeContinuation.findFirst({
          where: {
            id: input.continuationId,
            organizationId: input.organizationId,
          },
        })) as ContinuationRow | null;
      if (!continuation) {
        throw new Error(
          `Workflow continuation ${input.continuationId} not found in organization`,
        );
      }
      if (
        continuation.externalId &&
        continuation.externalId !== input.externalId
      ) {
        throw new Error(
          `Workflow continuation ${input.continuationId} provider identity changed`,
        );
      }

      const previousResult = this.readProviderResult(
        continuation.providerResult,
      );
      const previousAccepted = this.readProviderResult(
        previousResult.acceptedFalOutput,
      );
      const previousQuantities = this.readProviderResult(
        previousAccepted.completionQuantities,
      );
      if (
        continuation.provider === 'fal' &&
        previousResult.acceptedFalOutput !== undefined
      ) {
        if (previousAccepted.externalId !== input.externalId)
          throw new Error('Fal accepted output identity changed');
        for (const key of ['width', 'height', 'duration'] as const) {
          if (
            input.completionQuantities?.[key] !== undefined &&
            previousQuantities[key] !== input.completionQuantities[key]
          )
            throw new Error(`Fal accepted ${key} changed`);
        }
      }

      await transaction.workflowNodeContinuation.update({
        data: {
          externalId: input.externalId,
          ...(continuation.provider === 'fal'
            ? {
                providerResult: {
                  ...previousResult,
                  acceptedFalOutput: previousResult.acceptedFalOutput ?? {
                    externalId: input.externalId,
                    ...(input.completionQuantities
                      ? { completionQuantities: input.completionQuantities }
                      : {}),
                  },
                } as Prisma.InputJsonValue,
              }
            : {}),
          ...(continuation.provider === 'heygen' && requiresPoll
            ? {
                pollAttempt: continuation.pollAttempt ?? 1,
                pollDispatchClaimedAt: null,
                pollDispatchedAt: null,
              }
            : {}),
          ...(continuation.status ===
          WorkflowNodeContinuationStatus.PENDING_SUBMISSION
            ? { status: WorkflowNodeContinuationStatus.WAITING_PROVIDER }
            : {}),
        },
        where: { id: continuation.id },
      });
      await this.generationBilling?.recordContinuationProof(
        transaction,
        continuation,
        { kind: 'accepted', providerJobId: input.externalId },
      );
    });

    if (requiresPoll) {
      try {
        await this.reconcileHeygenPollTransport(input.continuationId);
      } catch (error: unknown) {
        this.logger.warn(
          `${this.logContext} left HeyGen poll dispatch in the durable outbox`,
          {
            continuationId: input.continuationId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  /** Only the server's file probe can fill missing quantities after durable provider acceptance. */
  async recordFalOutputMeasurement(input: {
    continuationId: string;
    organizationId: string;
    ingredientId: string;
    externalId: string;
    measurement: {
      width: number;
      height: number;
      duration: number;
      framesPerSecond: number;
      assetHash: string;
      sizeBytes: number;
      assetKey: string;
    };
  }): Promise<void> {
    const measured = input.measurement;
    if (
      ![measured.width, measured.height, measured.sizeBytes].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      ![measured.duration, measured.framesPerSecond].every(
        (value) => Number.isFinite(value) && value > 0,
      ) ||
      !/^[a-f0-9]{64}$/.test(measured.assetHash) ||
      !measured.assetKey
    )
      throw new Error('Fal output measurement is incomplete');
    await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.workflowNodeContinuation.findFirst({
        where: {
          id: input.continuationId,
          organizationId: input.organizationId,
          ingredientId: input.ingredientId,
          externalId: input.externalId,
          provider: 'fal',
          status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
        },
      });
      if (!row)
        throw new Error(
          'Fal output measurement has no matching accepted continuation',
        );
      const original = this.readProviderResult(row.providerResult);
      const accepted = this.readProviderResult(original.acceptedFalOutput);
      if (accepted.externalId !== input.externalId)
        throw new Error('Fal accepted output identity changed');
      const reported = this.readProviderResult(accepted.completionQuantities);
      for (const key of ['width', 'height', 'duration'] as const) {
        if (reported[key] !== undefined && reported[key] !== measured[key])
          throw new Error(`Fal measured ${key} disagrees with the provider`);
      }
      const existing = this.readProviderResult(original.measuredFalOutput);
      if (
        original.measuredFalOutput !== undefined &&
        (existing.externalId !== input.externalId ||
          Object.entries(measured).some(
            ([key, value]) =>
              this.readProviderResult(existing.measurement)[key] !== value,
          ))
      )
        throw new Error('Fal output measurement changed');
      const updated = await transaction.workflowNodeContinuation.updateMany({
        where: {
          id: row.id,
          organizationId: input.organizationId,
          status: row.status,
          updatedAt: row.updatedAt,
          externalId: input.externalId,
        },
        data: {
          providerResult: {
            ...original,
            measuredFalOutput: {
              externalId: input.externalId,
              measurement: measured,
            },
          } as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1)
        throw new Error('Fal output measurement lost its continuation claim');
    });
  }

  private readProviderResult(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  async requestHeygenPollAttempt(input: {
    attempt: number;
    continuationId: string;
    externalId: string;
    organizationId: string;
  }): Promise<void> {
    const updated = await this.prisma.workflowNodeContinuation.updateMany({
      data: {
        pollAttempt: input.attempt,
        pollDispatchClaimedAt: null,
        pollDispatchedAt: null,
      },
      where: {
        externalId: input.externalId,
        id: input.continuationId,
        organizationId: input.organizationId,
        provider: 'heygen',
        status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      },
    });
    if (updated.count !== 1) {
      throw new Error(
        `HeyGen continuation ${input.continuationId} cannot schedule poll attempt ${input.attempt}`,
      );
    }
    await this.reconcileHeygenPollTransport(input.continuationId);
  }

  async reconcileHeygenPollTransport(continuationId?: string): Promise<number> {
    if (!this.heygenPollQueueService) {
      return 0;
    }
    const rows = (await this.prisma.workflowNodeContinuation.findMany({
      take: 100,
      where: {
        ...(continuationId ? { id: continuationId } : {}),
        externalId: { not: null },
        pollAttempt: { not: null },
        provider: 'heygen',
        status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      },
    })) as ContinuationRow[];
    let dispatched = 0;
    const staleClaimBefore = new Date(Date.now() - 2 * 60 * 1000);

    for (const row of rows) {
      if (!row.externalId || row.pollAttempt === null) {
        continue;
      }
      if (
        row.pollDispatchedAt &&
        (await this.heygenPollQueueService.hasAttempt(row.id, row.pollAttempt))
      ) {
        continue;
      }
      if (
        row.pollDispatchClaimedAt &&
        row.pollDispatchClaimedAt > staleClaimBefore
      ) {
        continue;
      }

      // sql-risk-audit: ignore bulk-write-tenant-review -- compare-and-set on a row already loaded with organizationId; id+pollAttempt is the lease key.
      const claimed = await this.prisma.workflowNodeContinuation.updateMany({
        data: { pollDispatchClaimedAt: new Date() },
        where: {
          id: row.id,
          pollAttempt: row.pollAttempt,
          status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
          OR: [
            { pollDispatchClaimedAt: null },
            { pollDispatchClaimedAt: { lt: staleClaimBefore } },
          ],
        },
      });
      if (claimed.count !== 1) {
        continue;
      }

      try {
        const jobId = await this.heygenPollQueueService.schedule({
          attempt: row.pollAttempt,
          continuationId: row.id,
          externalId: row.externalId,
          ingredientId: row.ingredientId,
          organizationId: row.organizationId,
        });
        if (!jobId) {
          throw new Error('HeyGen poll queue is unavailable');
        }
        // sql-risk-audit: ignore bulk-write-tenant-review -- compare-and-set on the same continuation row already tenant-loaded above.
        await this.prisma.workflowNodeContinuation.updateMany({
          data: {
            pollDispatchClaimedAt: null,
            pollDispatchedAt: new Date(),
          },
          where: {
            id: row.id,
            pollAttempt: row.pollAttempt,
            status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
          },
        });
        dispatched += 1;
      } catch (error: unknown) {
        // sql-risk-audit: ignore bulk-write-tenant-review -- compare-and-set on the same continuation row already tenant-loaded above.
        await this.prisma.workflowNodeContinuation.updateMany({
          data: { pollDispatchClaimedAt: null },
          where: { id: row.id, pollAttempt: row.pollAttempt },
        });
        if (continuationId) {
          throw error;
        }
        this.logger.error(
          `${this.logContext} failed to dispatch HeyGen poll continuation`,
          error,
          {
            continuationId: row.id,
            organizationId: row.organizationId,
            pollAttempt: row.pollAttempt,
          },
        );
      }
    }
    return dispatched;
  }

  async findCallbackTarget(input: {
    continuationId: string;
    provider: string;
  }): Promise<{
    externalId: string | null;
    ingredientId: string;
    organizationId: string;
  } | null> {
    return (await this.prisma.workflowNodeContinuation.findFirst({
      select: { externalId: true, ingredientId: true, organizationId: true },
      where: {
        id: input.continuationId,
        provider: input.provider,
      },
    })) as {
      externalId: string | null;
      ingredientId: string;
      organizationId: string;
    } | null;
  }

  async ownsSuspendedNode(input: {
    actionId: string;
    executionId: string;
    nodeId: string;
    organizationId: string;
    workflowVersionId: string;
  }): Promise<boolean> {
    const continuation = await this.prisma.workflowNodeContinuation.findFirst({
      select: { id: true },
      where: {
        actionId: input.actionId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        organizationId: input.organizationId,
        status: {
          in: [
            WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
            WorkflowNodeContinuationStatus.WAITING_PROVIDER,
            WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
            WorkflowNodeContinuationStatus.PROVIDER_FAILED,
            WorkflowNodeContinuationStatus.RESUMING,
          ],
        },
        workflowVersionId: input.workflowVersionId,
      },
    });
    return continuation !== null;
  }

  async findIngredientCallbackTarget(input: {
    ingredientId: string;
    organizationId: string;
    provider: string;
  }): Promise<{ externalId: string | null } | null> {
    return this.prisma.workflowNodeContinuation.findFirst({
      select: { externalId: true },
      where: {
        ingredientId: input.ingredientId,
        organizationId: input.organizationId,
        provider: input.provider,
      },
    });
  }

  async failProviderSubmission(input: {
    continuationId: string;
    error: string;
    organizationId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const continuation =
        (await transaction.workflowNodeContinuation.findFirst({
          where: {
            id: input.continuationId,
            organizationId: input.organizationId,
            status: {
              in: [
                WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
                WorkflowNodeContinuationStatus.WAITING_PROVIDER,
              ],
            },
          },
        })) as ContinuationRow | null;
      if (!continuation) {
        throw new Error(
          `Workflow continuation ${input.continuationId} has no active provider submission to fail`,
        );
      }

      const completedAt = new Date();
      await Promise.all([
        transaction.workflowNodeContinuation.updateMany({
          data: {
            completedAt,
            error: input.error,
            status: WorkflowNodeContinuationStatus.FAILED,
          },
          where: {
            id: continuation.id,
            organizationId: input.organizationId,
            status: continuation.status,
          },
        }),
        transaction.ingredient.updateMany({
          data: { status: IngredientStatus.FAILED },
          where: {
            id: continuation.ingredientId,
            isDeleted: false,
            organizationId: input.organizationId,
          },
        }),
        transaction.workflowNodeClaim.updateMany({
          data: {
            error: input.error,
            leaseExpiresAt: null,
            leaseOwnerId: null,
            status: 'failed',
          },
          where: {
            executionId: continuation.executionId,
            nodeId: continuation.nodeId,
            organizationId: input.organizationId,
          },
        }),
        transaction.workflowExecutionNodeResult.updateMany({
          data: {
            completedAt,
            error: input.error,
            progress: 100,
            status: PrismaWorkflowExecutionStatus.FAILED,
          },
          where: {
            executionId: continuation.executionId,
            nodeId: continuation.nodeId,
            organizationId: input.organizationId,
          },
        }),
      ]);
      if (
        continuation.status ===
        WorkflowNodeContinuationStatus.PENDING_SUBMISSION
      ) {
        await this.generationBilling?.recordContinuationProof(
          transaction,
          continuation,
          { kind: 'submission-rejected' },
        );
      }
    });
  }

  async attachInitialOutput(input: {
    actionId: string;
    creditsUsed: number;
    executionId: string;
    initialOutput: unknown;
    nodeId: string;
    organizationId: string;
    workflowVersionId: string;
  }): Promise<AttachedContinuationOutput> {
    this.validateActionOutput(input.actionId, input.initialOutput);

    return this.prisma.$transaction(async (transaction) => {
      const continuation =
        (await transaction.workflowNodeContinuation.findFirst({
          where: {
            actionId: input.actionId,
            executionId: input.executionId,
            nodeId: input.nodeId,
            organizationId: input.organizationId,
            workflowVersionId: input.workflowVersionId,
          },
        })) as ContinuationRow | null;
      if (!continuation) {
        throw new Error(
          `Provider-callback action ${input.actionId} did not create a durable continuation before submission`,
        );
      }

      const providerSucceeded =
        continuation.status ===
        WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED;
      const providerFailed =
        continuation.status === WorkflowNodeContinuationStatus.PROVIDER_FAILED;
      const finalOutput = providerSucceeded
        ? this.buildFinalOutput(input.actionId, input.initialOutput)
        : providerFailed
          ? this.buildFailedOutput(input.actionId, input.initialOutput)
          : undefined;
      if (finalOutput !== undefined) {
        this.validateActionOutput(input.actionId, finalOutput);
      }

      await transaction.workflowNodeContinuation.update({
        data: {
          creditsUsed: input.creditsUsed,
          initialOutput: input.initialOutput as Prisma.InputJsonValue,
          ...(providerSucceeded || providerFailed
            ? {
                resumeClaimedAt: new Date(),
                status: WorkflowNodeContinuationStatus.RESUMING,
              }
            : { status: WorkflowNodeContinuationStatus.WAITING_PROVIDER }),
        },
        where: { id: continuation.id },
      });

      if (!providerSucceeded && !providerFailed) {
        return { kind: 'waiting' };
      }

      return {
        continuationId: continuation.id,
        ...(providerFailed && continuation.error
          ? { error: continuation.error }
          : {}),
        ...(finalOutput === undefined ? {} : { finalOutput }),
        kind: 'provider-settled',
        succeeded: providerSucceeded,
      };
    });
  }

  async claimProviderSettlement(input: {
    error?: string;
    identity: ProviderContinuationIdentity;
    provider: string;
    providerResult?: Record<string, unknown>;
    succeeded: boolean;
  }): Promise<ContinuationSettlement> {
    return this.prisma.$transaction(async (transaction) => {
      const continuation =
        (await transaction.workflowNodeContinuation.findFirst({
          where: this.buildIdentityWhere(input.provider, input.identity),
        })) as ContinuationRow | null;
      if (!continuation) {
        this.logger.warn(`${this.logContext} callback has no continuation`, {
          identity: input.identity,
          provider: input.provider,
        });
        return { kind: 'duplicate' };
      }

      if (continuation.provider !== input.provider) {
        throw new Error(
          `Workflow continuation ${continuation.id} provider mismatch`,
        );
      }

      const terminal =
        continuation.status === WorkflowNodeContinuationStatus.COMPLETED ||
        continuation.status === WorkflowNodeContinuationStatus.FAILED;
      const leaseIsFresh =
        continuation.status === WorkflowNodeContinuationStatus.RESUMING &&
        continuation.resumeClaimedAt !== null &&
        Date.now() - continuation.resumeClaimedAt.getTime() < RESUME_LEASE_MS;
      if (terminal || leaseIsFresh) {
        return { kind: 'duplicate' };
      }

      const providerStatus = input.succeeded
        ? WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED
        : WorkflowNodeContinuationStatus.PROVIDER_FAILED;
      const hasInitialOutput = continuation.initialOutput !== null;
      const canResume = hasInitialOutput || !input.succeeded;
      const finalOutput =
        input.succeeded && hasInitialOutput
          ? this.buildFinalOutput(
              continuation.actionId,
              continuation.initialOutput,
            )
          : !input.succeeded && hasInitialOutput
            ? this.buildFailedOutput(
                continuation.actionId,
                continuation.initialOutput,
              )
            : undefined;
      if (finalOutput !== undefined) {
        this.validateActionOutput(continuation.actionId, finalOutput);
      }

      // sql-risk-audit: ignore bulk-write-tenant-review -- compare-and-set on continuation.id after the tenant-scoped load of this row.
      const claimed = await transaction.workflowNodeContinuation.updateMany({
        data: {
          error: input.error ?? null,
          providerResult: mergeWorkflowProviderResult(
            continuation.providerResult,
            input.providerResult,
          ),
          resumeClaimedAt: canResume ? new Date() : null,
          status: canResume
            ? WorkflowNodeContinuationStatus.RESUMING
            : providerStatus,
        },
        where: {
          id: continuation.id,
          status: continuation.status,
          updatedAt: continuation.updatedAt,
        },
      });
      if (claimed.count !== 1) {
        return { kind: 'duplicate' };
      }
      if (!canResume) {
        return { kind: 'pending-output' };
      }

      return {
        actionId: continuation.actionId,
        continuationId: continuation.id,
        creditsUsed: continuation.creditsUsed,
        ...(input.succeeded
          ? { finalOutput }
          : {
              error: input.error ?? 'Provider generation failed',
              ...(finalOutput === undefined ? {} : { finalOutput }),
            }),
        executionId: continuation.executionId,
        ingredientId: continuation.ingredientId,
        kind: 'claimed',
        nodeId: continuation.nodeId,
        organizationId: continuation.organizationId,
        workflowVersionId: continuation.workflowVersionId,
      };
    });
  }

  async recordProviderSettlement(input: {
    error?: string;
    identity: ProviderContinuationIdentity;
    provider: string;
    providerResult?: Record<string, unknown>;
    succeeded: boolean;
  }): Promise<'duplicate' | 'recorded'> {
    return this.prisma.$transaction(async (transaction) => {
      const continuation =
        (await transaction.workflowNodeContinuation.findFirst({
          where: this.buildIdentityWhere(input.provider, input.identity),
        })) as ContinuationRow | null;
      if (!continuation) {
        return 'duplicate';
      }
      if (continuation.provider !== input.provider) {
        throw new Error(
          `Workflow continuation ${continuation.id} provider mismatch`,
        );
      }
      if (
        continuation.status === WorkflowNodeContinuationStatus.COMPLETED ||
        continuation.status === WorkflowNodeContinuationStatus.FAILED ||
        continuation.status === WorkflowNodeContinuationStatus.RESUMING ||
        continuation.status ===
          WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED ||
        continuation.status === WorkflowNodeContinuationStatus.PROVIDER_FAILED
      ) {
        return 'duplicate';
      }
      const callbackExternalId =
        typeof input.providerResult?.externalId === 'string'
          ? input.providerResult.externalId
          : undefined;
      if (
        continuation.externalId &&
        callbackExternalId &&
        continuation.externalId !== callbackExternalId
      ) {
        throw new Error(
          `Workflow continuation ${continuation.id} callback external identity mismatch`,
        );
      }

      // sql-risk-audit: ignore bulk-write-tenant-review -- compare-and-set on continuation.id after the tenant-scoped load of this row.
      const recorded = await transaction.workflowNodeContinuation.updateMany({
        data: {
          error: input.error ?? null,
          ...(callbackExternalId ? { externalId: callbackExternalId } : {}),
          providerResult: mergeWorkflowProviderResult(
            continuation.providerResult,
            input.providerResult,
          ),
          status: input.succeeded
            ? WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED
            : WorkflowNodeContinuationStatus.PROVIDER_FAILED,
        },
        where: {
          id: continuation.id,
          status: continuation.status,
          updatedAt: continuation.updatedAt,
        },
      });
      return recorded.count === 1 ? 'recorded' : 'duplicate';
    });
  }

  async findReconciliationCandidates(): Promise<
    ContinuationReconciliationCandidate[]
  > {
    const staleBefore = new Date(Date.now() - RESUME_LEASE_MS);
    const rows = (await this.prisma.workflowNodeContinuation.findMany({
      take: 100,
      where: {
        OR: [
          {
            status: {
              in: [
                WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED,
                WorkflowNodeContinuationStatus.PROVIDER_FAILED,
              ],
            },
          },
          {
            resumeClaimedAt: { lt: staleBefore },
            status: WorkflowNodeContinuationStatus.RESUMING,
          },
        ],
      },
    })) as ContinuationRow[];

    // An expired submission lease does not establish provider rejection.
    // Recover only authoritative provider results or a resumable result lease.
    return rows
      .filter(
        (row) =>
          row.status !== WorkflowNodeContinuationStatus.PENDING_SUBMISSION,
      )
      .map((row) => {
        const succeeded =
          row.status === WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED ||
          (row.status === WorkflowNodeContinuationStatus.RESUMING &&
            row.error === null);
        return {
          continuationId: row.id,
          ...(row.error ? { error: row.error } : {}),
          organizationId: row.organizationId,
          provider: row.provider,
          providerResult:
            row.providerResult && typeof row.providerResult === 'object'
              ? (row.providerResult as Record<string, unknown>)
              : undefined,
          succeeded,
        };
      });
  }

  async findReplicatePollCandidates(): Promise<
    Array<{
      continuationId: string;
      externalId: string;
      ingredientId: string;
      isByok: boolean;
      organizationId: string;
    }>
  > {
    const rows = await this.prisma.workflowNodeContinuation.findMany({
      select: {
        externalId: true,
        id: true,
        ingredientId: true,
        isByok: true,
        organizationId: true,
      },
      take: 100,
      where: {
        externalId: { not: null },
        provider: 'replicate',
        status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      },
    });
    return rows.flatMap((row) =>
      row.externalId
        ? [
            {
              continuationId: row.id,
              externalId: row.externalId,
              ingredientId: row.ingredientId,
              isByok: row.isByok,
              organizationId: row.organizationId,
            },
          ]
        : [],
    );
  }

  async markSettlementFinished(input: {
    continuationId: string;
    organizationId: string;
    succeeded: boolean;
  }): Promise<void> {
    await finishWorkflowContinuationSettlement(
      this.prisma,
      this.generationBilling,
      input,
    );
  }

  private assertProviderCallbackAction(actionId: string): void {
    const action = getActionDefinition(actionId);
    if (action?.completionMode !== 'provider-callback') {
      throw new Error(
        `Action ${actionId} does not declare provider-callback completion`,
      );
    }
  }

  private validateActionOutput(actionId: string, output: unknown): void {
    const action = getActionDefinition(actionId);
    if (!action) {
      throw new Error(`Unknown Genfeed action ${actionId}`);
    }
    compileActionContract(actionId, {
      inputSchema: action.inputSchema as ActionContractJsonSchema,
      outputSchema: action.outputSchema as ActionContractJsonSchema,
    }).validateOutput(output, {
      nodeId: 'provider-callback',
      runId: 'provider-callback',
      workflowId: 'provider-callback',
      workflowVersionId: 'provider-callback',
    });
  }

  private buildFinalOutput(actionId: string, output: unknown): unknown {
    if (actionId === 'workspace.task.facecam.generate') {
      return output;
    }
    if (!MEDIA_CALLBACK_ACTION_IDS.has(actionId)) {
      throw new Error(
        `Provider-callback action ${actionId} has no exact continuation finalizer`,
      );
    }
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new Error(
        `Provider-callback action ${actionId} returned a non-object media result`,
      );
    }
    return {
      ...(output as Record<string, unknown>),
      status: IngredientStatus.GENERATED,
    };
  }

  private buildFailedOutput(actionId: string, output: unknown): unknown {
    if (actionId === 'workspace.task.facecam.generate') {
      return undefined;
    }
    if (!MEDIA_CALLBACK_ACTION_IDS.has(actionId)) {
      throw new Error(
        `Provider-callback action ${actionId} has no exact continuation finalizer`,
      );
    }
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new Error(
        `Provider-callback action ${actionId} returned a non-object media result`,
      );
    }
    return {
      ...(output as Record<string, unknown>),
      status: IngredientStatus.FAILED,
    };
  }

  private buildIdentityWhere(
    provider: string,
    identity: ProviderContinuationIdentity,
  ): Record<string, unknown> {
    const organizationId = identity.organizationId;
    if ('continuationId' in identity) {
      return {
        id: identity.continuationId,
        provider,
        organizationId,
      };
    }
    if ('ingredientId' in identity) {
      return {
        ingredientId: identity.ingredientId,
        provider,
        organizationId,
      };
    }
    return {
      externalId: identity.externalId,
      organizationId,
      provider,
    };
  }

  private assertSameIdentity(
    existing: ContinuationRow,
    expected: {
      actionId: string;
      ingredientId: string;
      organizationId: string;
      provider: string;
      workflowVersionId: string;
    },
  ): void {
    if (
      existing.actionId !== expected.actionId ||
      existing.ingredientId !== expected.ingredientId ||
      existing.organizationId !== expected.organizationId ||
      existing.provider !== expected.provider ||
      existing.workflowVersionId !== expected.workflowVersionId
    ) {
      throw new Error(
        `Workflow continuation ${existing.id} identity does not match its immutable execution node`,
      );
    }
  }
}
