import { createHash } from 'node:crypto';
import {
  generationQuoteGroupMetadataSchema,
  generationQuoteGroupReceiptSchema,
} from '@api/helpers/utils/credits/generation-quote-group.schema';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { ByokService } from '@api/services/byok/byok.service';
import { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import type { CrunTaskStatusResponse } from '@api/services/integrations/crun/crun-response.schema';
import type {
  CrunPreparedTask,
  CrunProviderRequest,
  CrunResolvedCredential,
} from '@api/services/integrations/crun/crun-task.schema';
import { crunFundingBindingSchema } from '@api/services/integrations/crun/crun-task.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { type CrunGenerationTask, toPrismaJson } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class CrunTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly byok: ByokService,
    private readonly config: ConfigService,
    private readonly client: CrunClient,
  ) {}

  isAdmissionEnabled(): boolean {
    return this.config.get('CRUN_ENABLED') === 'true';
  }

  async resolveCredential(
    organizationId: string,
  ): Promise<CrunResolvedCredential> {
    const byok = await this.byok.lookupApiKey(
      organizationId,
      ByokProvider.CRUN,
    );
    const apiKey = byok?.apiKey ?? this.config.get('CRUN_API_KEY');
    if (typeof apiKey !== 'string' || !apiKey)
      throw new ServiceUnavailableException({
        code: 'CRUN_CREDENTIAL_UNAVAILABLE',
      });
    return {
      apiKey,
      credentialSource: byok ? 'byok' : 'hosted',
      credentialId: null,
      credentialFingerprint: createHash('sha256').update(apiKey).digest('hex'),
    };
  }

  async resolveOriginalCredential(
    task: CrunGenerationTask,
  ): Promise<CrunResolvedCredential | null> {
    const current = await this.prisma.crunGenerationTask.findFirst({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        isDeleted: false,
      },
    });
    if (
      !current?.providerTaskId ||
      ![
        'pending',
        'running',
        'provider-success',
        'provider-failed',
        'recovery-required',
      ].includes(current.state) ||
      current.providerTaskId !== task.providerTaskId ||
      current.credentialSource !== task.credentialSource ||
      current.credentialFingerprint !== task.credentialFingerprint ||
      current.credentialId !== null
    )
      return null;
    try {
      const byok =
        current.credentialSource === 'byok'
          ? await this.byok.lookupRetainedCrunApiKey(current.organizationId)
          : undefined;
      return this.matchCredential(
        current,
        current.credentialSource === 'hosted'
          ? this.config.get('CRUN_API_KEY')
          : byok?.apiKey,
      );
    } catch {
      return null;
    }
  }

  async resolveSubmissionCredential(
    task: CrunGenerationTask,
  ): Promise<CrunResolvedCredential | null> {
    try {
      const byok =
        task.credentialSource === 'byok'
          ? await this.byok.lookupApiKey(task.organizationId, ByokProvider.CRUN)
          : undefined;
      return this.matchCredential(
        task,
        task.credentialSource === 'hosted'
          ? this.config.get('CRUN_API_KEY')
          : byok?.apiKey,
      );
    } catch {
      return null;
    }
  }

  private matchCredential(
    task: CrunGenerationTask,
    apiKey: unknown,
  ): CrunResolvedCredential | null {
    if (
      task.credentialId !== null ||
      typeof apiKey !== 'string' ||
      !apiKey ||
      createHash('sha256').update(apiKey).digest('hex') !==
        task.credentialFingerprint
    )
      return null;
    return {
      apiKey,
      credentialSource: task.credentialSource as 'hosted' | 'byok',
      credentialId: null,
      credentialFingerprint: task.credentialFingerprint,
    };
  }

  findForIngredient(organizationId: string, ingredientId: string) {
    return this.prisma.crunGenerationTask.findFirst({
      where: { ingredientId, isDeleted: false, organizationId },
    });
  }

  /** All funded rows must exist atomically before any CreateTask request. */
  async prepareTasks(
    inputs: CrunPreparedTask[],
  ): Promise<CrunGenerationTask[]> {
    if (!this.isAdmissionEnabled())
      throw new ServiceUnavailableException({ code: 'CRUN_DISABLED' });
    return this.runSerializable(async (transaction) => {
      const rows: CrunGenerationTask[] = [];
      for (const input of inputs) {
        await this.validateFunding(transaction, input);
        const referenceCount = input.inputMetadata.referenceCount;
        if (
          typeof referenceCount !== 'number' ||
          !Number.isInteger(referenceCount) ||
          referenceCount < 0 ||
          referenceCount > 14 ||
          typeof input.inputMetadata.intentHash !== 'string' ||
          !/^[a-f0-9]{64}$/.test(input.inputMetadata.intentHash)
        )
          throw new BadRequestException({ code: 'CRUN_TASK_METADATA_INVALID' });
        rows.push(
          await transaction.crunGenerationTask.create({
            data: {
              ...input,
              fundingBinding: toPrismaJson(input.fundingBinding),
              // Redacted projection: no prompt body, user metadata or signed URLs.
              inputMetadata: {
                referenceCount,
                ...(typeof input.inputMetadata.intentHash === 'string' &&
                /^[a-f0-9]{64}$/.test(input.inputMetadata.intentHash)
                  ? { intentHash: input.inputMetadata.intentHash }
                  : {}),
              },
            },
          }),
        );
      }
      return rows;
    });
  }

  async submit(
    task: CrunGenerationTask,
    request: CrunProviderRequest,
    now = new Date(),
  ) {
    if (!this.isAdmissionEnabled())
      return { isSubmitted: false, reasonCode: 'CRUN_DISABLED' };
    const active = await this.prisma.model.findFirst({
      where: {
        key: task.modelKey,
        isActive: true,
        isDeleted: false,
        reviewedProviderContractVersion: task.contractVersion,
        pendingProviderContractVersion: null,
        OR: [{ organizationId: null }, { organizationId: task.organizationId }],
      },
      select: { id: true },
    });
    if (!active || request.model !== task.endpoint)
      return { isSubmitted: false, reasonCode: 'CRUN_MODEL_UNAVAILABLE' };
    const credential = await this.resolveSubmissionCredential(task);
    if (!credential) {
      await this.markRecovery(task, 'CRUN_ORIGINAL_CREDENTIAL_UNAVAILABLE');
      return {
        isSubmitted: false,
        reasonCode: 'CRUN_ORIGINAL_CREDENTIAL_UNAVAILABLE',
      };
    }
    const claimed = await this.runSerializable(async (transaction) => {
      const current = await transaction.crunGenerationTask.findFirst({
        where: {
          id: task.id,
          organizationId: task.organizationId,
          isDeleted: false,
          state: 'prepared',
          version: task.version,
        },
      });
      if (!current) return { count: 0 };
      await this.validateFunding(transaction, current);
      return transaction.crunGenerationTask.updateMany({
        where: {
          id: task.id,
          organizationId: task.organizationId,
          isDeleted: false,
          state: 'prepared',
          version: task.version,
        },
        data: {
          state: 'submitting',
          submittedAt: now,
          deadlineAt: new Date(now.getTime() + 1200000),
          nextPollAt: new Date(now.getTime() + 30000),
          version: { increment: 1 },
        },
      });
    });
    if (claimed.count !== 1)
      return { isSubmitted: false, reasonCode: 'CRUN_TASK_ALREADY_CLAIMED' };
    const version = task.version + 1;
    const result = await this.client.createTask(credential, request);
    const where = {
      id: task.id,
      organizationId: task.organizationId,
      isDeleted: false,
      version,
      state: 'submitting',
    };
    if (result.isValid) {
      await this.prisma.crunGenerationTask.updateMany({
        where,
        data: {
          providerTaskId: result.data.taskId,
          state: 'pending',
          version: { increment: 1 },
        },
      });
      return { isSubmitted: true, taskId: result.data.taskId };
    }
    if (result.disposition === 'deferred') {
      // Shared gate proves the HTTP request never started; explicit caller may retry this prepared row.
      await this.prisma.crunGenerationTask.updateMany({
        where,
        data: {
          state: 'prepared',
          submittedAt: null,
          deadlineAt: null,
          nextPollAt: null,
          version: { increment: 1 },
        },
      });
    } else if (result.disposition === 'refused') {
      await this.prisma.crunGenerationTask.updateMany({
        where,
        data: {
          state: 'provider-failed',
          failureCode: result.reasonCode,
          terminalReceipt: { isAccepted: false, credits: '0' },
          version: { increment: 1 },
        },
      });
    } else await this.markRecovery({ ...task, version }, result.reasonCode);
    return { isSubmitted: false, reasonCode: result.reasonCode };
  }

  private async runSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (
          attempt >= 2 ||
          !(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2034'
          )
        )
          throw error;
      }
    }
  }

  private async validateFunding(
    transaction: Prisma.TransactionClient,
    input: CrunPreparedTask | CrunGenerationTask,
  ): Promise<void> {
    const invalid = () =>
      new BadRequestException({ code: 'CRUN_TASK_BINDING_INVALID' });
    const binding = crunFundingBindingSchema.safeParse(input.fundingBinding);
    const quoted = modelBillableQuoteSnapshotSchema.safeParse(
      input.quoteSnapshot,
    );
    if (!binding.success || !quoted.success || !quoted.data.providerQuote)
      throw invalid();
    const quote = quoted.data;
    const frozen = quote.providerQuote;
    if (!frozen) throw invalid();
    if (
      quote.modelKey !== input.modelKey ||
      frozen.contractVersion !== input.contractVersion ||
      frozen.inputHash !== input.inputHash ||
      frozen.credentialSource !== input.credentialSource ||
      frozen.credentialId !== input.credentialId ||
      frozen.credentialFingerprint !== input.credentialFingerprint
    )
      throw invalid();
    const ingredient = await transaction.ingredient.findFirst({
      where: {
        id: input.ingredientId,
        organizationId: input.organizationId,
        userId: input.userId,
        isDeleted: false,
        ...(input.brandId ? { brandId: input.brandId } : {}),
      },
      select: { generationBilling: true },
    });
    if (!ingredient) throw invalid();
    if (binding.data.kind === 'free') {
      if (
        input.credentialSource !== 'hosted' ||
        input.reservationId !== null ||
        quote.credits !== 0 ||
        !quote.pricingProfile.isFree ||
        ingredient.generationBilling !== null
      )
        throw invalid();
      return;
    }
    if (binding.data.kind === 'byok') {
      const receipt = generationUsageReceiptSchema.safeParse(
        ingredient.generationBilling,
      );
      const outputs =
        quote.quantities.outputs ?? quote.quantities.requests ?? 1;
      if (
        input.credentialSource !== 'byok' ||
        input.reservationId !== null ||
        !receipt.success ||
        receipt.data.state !== 'pending' ||
        receipt.data.confirmedFailure ||
        receipt.data.userId !== input.userId ||
        receipt.data.submissionIntentProvider !== 'crun' ||
        receipt.data.amount !== quote.credits / outputs
      )
        throw invalid();
      const {
        kind: _kind,
        state: _state,
        confirmedFailure: _failure,
        ...immutable
      } = receipt.data;
      if (JSON.stringify(immutable) !== JSON.stringify(binding.data.receipt))
        throw invalid();
      return;
    }
    if (
      input.credentialSource !== 'hosted' ||
      !input.reservationId ||
      quote.credits <= 0
    )
      throw invalid();
    const reservation = await transaction.creditReservation.findFirst({
      where: {
        id: input.reservationId,
        organizationId: input.organizationId,
        actorUserId: input.userId,
        isDeleted: false,
        status: 'RESERVED',
      },
      select: { workloadId: true, metadata: true, amount: true },
    });
    if (!reservation) throw invalid();
    const receipt = generationQuoteGroupReceiptSchema.safeParse(
      ingredient.generationBilling,
    );
    const metadata = generationQuoteGroupMetadataSchema.safeParse(
      reservation.metadata,
    );
    if (receipt.success) {
      if (
        receipt.data.reservationId !== input.reservationId ||
        receipt.data.outputIndex !== input.outputIndex ||
        !metadata.success ||
        metadata.data.boundOutputIds[input.outputIndex] !==
          input.ingredientId ||
        JSON.stringify(metadata.data.modelQuote) !== JSON.stringify(quote)
      )
        throw invalid();
    } else {
      if (
        reservation.workloadId !== input.ingredientId ||
        Number(reservation.amount) !== quote.allocatedCredits[input.outputIndex]
      )
        throw invalid();
      const heldQuote = modelBillableQuoteSnapshotSchema.safeParse(
        typeof reservation.metadata === 'object' &&
          reservation.metadata !== null &&
          !Array.isArray(reservation.metadata)
          ? reservation.metadata.modelQuote
          : undefined,
      );
      if (
        !heldQuote.success ||
        JSON.stringify(heldQuote.data) !== JSON.stringify(quote)
      )
        throw invalid();
    }
  }

  /** Poll once. Return signed media URLs only ephemerally to the owned-media finalizer. */
  async poll(
    task: CrunGenerationTask,
    now = new Date(),
  ): Promise<CrunTaskStatusResponse | null> {
    if (!task.providerTaskId) {
      await this.markRecovery(task, 'CRUN_ACCEPTANCE_AMBIGUOUS');
      return null;
    }
    const hasTerminalReceipt =
      task.state === 'provider-success' || task.state === 'provider-failed';
    if (
      !hasTerminalReceipt &&
      (task.pollCount >= 40 || !task.deadlineAt || task.deadlineAt <= now)
    ) {
      await this.markRecovery(task, 'CRUN_POLL_EXHAUSTED');
      return null;
    }
    const credential = await this.resolveOriginalCredential(task);
    if (!credential) {
      await this.markRecovery(task, 'CRUN_ORIGINAL_CREDENTIAL_UNAVAILABLE');
      return null;
    }
    const result = await this.client.taskInfo(credential, task.providerTaskId);
    const where = {
      id: task.id,
      organizationId: task.organizationId,
      isDeleted: false,
      version: task.version,
    };
    if (!result.isValid) {
      const consecutive404 =
        result.reasonCode === 'CRUN_TASK_NOT_FOUND'
          ? Number(
              task.failureCode?.match(/^CRUN_TASK_NOT_FOUND_(\d+)$/)?.[1] ?? 0,
            ) + 1
          : 0;
      if (result.disposition === 'recovery' || consecutive404 >= 3) {
        await this.markRecovery(
          task,
          consecutive404 >= 3 ? 'CRUN_TASK_NOT_FOUND' : result.reasonCode,
        );
      } else
        await this.prisma.crunGenerationTask.updateMany({
          where,
          data: {
            nextPollAt: new Date(
              now.getTime() + Math.max(30000, result.retryAfterMs),
            ),
            leaseUntil: null,
            pollCount: { increment: 1 },
            version: { increment: 1 },
            failureCode: consecutive404
              ? `CRUN_TASK_NOT_FOUND_${consecutive404}`
              : null,
          },
        });
      return null;
    }
    const info = result.data;
    const isTerminal = info.status === 'success' || info.status === 'failed';
    const { mediaUrls: _ephemeralUrls, ...receipt } = info;
    const updated = await this.prisma.crunGenerationTask.updateMany({
      where,
      data: {
        state:
          info.status === 'success'
            ? 'provider-success'
            : info.status === 'failed'
              ? 'provider-failed'
              : info.status,
        ...(isTerminal ? { terminalReceipt: toPrismaJson(receipt) } : {}),
        recoveryCode: info.recoveryCode,
        failureCode: null,
        leaseUntil: null,
        nextPollAt: new Date(now.getTime() + 30000),
        pollCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
    return updated.count === 1 && isTerminal ? info : null;
  }

  /** Deployment-global sweep; every claim re-enters the row's tenant scope. */
  async claimDue(now = new Date()): Promise<CrunGenerationTask[]> {
    return this.prisma.$transaction(async (transaction) => {
      // tenant-scope-ignore: explicitly deployment-global bounded sweep, followed by tenant-scoped CAS per row.
      const rows = await transaction.crunGenerationTask.findMany({
        orderBy: { nextPollAt: 'asc' },
        take: 100,
        where: {
          isDeleted: false,
          state: {
            in: [
              'submitting',
              'pending',
              'running',
              'provider-success',
              'provider-failed',
            ],
          },
          nextPollAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
      });
      const claimed: CrunGenerationTask[] = [];
      for (const row of rows) {
        const leaseUntil = new Date(now.getTime() + 60000);
        const result = await transaction.crunGenerationTask.updateMany({
          data: { leaseUntil, version: { increment: 1 } },
          where: {
            id: row.id,
            organizationId: row.organizationId,
            isDeleted: false,
            version: row.version,
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
          },
        });
        if (result.count === 1)
          claimed.push({ ...row, leaseUntil, version: row.version + 1 });
      }
      return claimed;
    });
  }

  async markRecovery(task: CrunGenerationTask, recoveryCode: string) {
    return this.prisma.crunGenerationTask.updateMany({
      data: {
        state: 'recovery-required',
        recoveryCode,
        leaseUntil: null,
        nextPollAt: null,
        version: { increment: 1 },
      },
      where: {
        id: task.id,
        organizationId: task.organizationId,
        isDeleted: false,
        version: task.version,
      },
    });
  }

  async requestCancellation(
    organizationId: string,
    ingredientId: string,
    now = new Date(),
  ) {
    // No provider cancel endpoint exists. Only durable intent is recorded.
    return this.prisma.crunGenerationTask.updateMany({
      data: { cancelRequestedAt: now },
      where: {
        organizationId,
        ingredientId,
        isDeleted: false,
        state: { not: 'finalized' },
      },
    });
  }
}
