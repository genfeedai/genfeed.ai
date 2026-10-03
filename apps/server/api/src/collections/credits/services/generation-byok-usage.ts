import type {
  GenerationBillingRequest,
  GenerationReleaseOutcome,
  GenerationSettlementOutcome,
} from '@api/collections/credits/services/generation-billing.service';
import {
  acknowledgeByokUsage,
  isCrunBillingDispositionAllowed,
  runCrunBillingMutation,
} from '@api/collections/credits/services/generation-crun-billing-guard';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { generationUsageReceiptSchema as usageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { scopedWhere } from '@api/index';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_HOLD_TTL_MS } from '@genfeedai/contracts/constants';
import type { IGenerationUsageReceipt } from '@genfeedai/contracts/interfaces/billing';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

export const SETTLEABLE_STATUSES: readonly string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

/**
 * The BYOK half of generation billing: the usage receipt an output carries
 * instead of a credit hold. Binding freezes the receipt, completion queues one
 * usage record, and failure marks the receipt failed. GenerationBillingService
 * owns it and decides when each step runs.
 */
export class GenerationByokUsage {
  constructor(
    private readonly queue: CreditDeductionQueueService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async bindOutput(
    request: GenerationBillingRequest,
    output: {
      credits: number;
      ingredientId: string;
      submissionIntentProvider?: string;
    },
    organizationId: string,
  ): Promise<void> {
    const config = request.creditsConfig;
    const userId = request.user?.userId ?? request.user?.id;
    if (!config || !userId)
      throw new BusinessLogicException('BYOK usage identity is required');
    const receipt: IGenerationUsageReceipt = usageReceiptSchema.parse({
      kind: 'byok',
      amount: output.credits,
      description: config.description,
      expiresAt: new Date(
        Date.now() + MEDIA_GENERATION_HOLD_TTL_MS,
      ).toISOString(),
      source: config.source ?? ActivitySource.SCRIPT,
      state: 'pending',
      userId,
      submissionIntentProvider: output.submissionIntentProvider,
    });
    const linked = await this.prisma.ingredient.updateMany({
      data: { generationBilling: toPrismaJson(receipt) },
      where: {
        id: output.ingredientId,
        organizationId,
        isDeleted: false,
        generationBilling: { equals: Prisma.DbNull },
      },
    });
    if (linked.count !== 1) {
      const existing = await this.readIngredient(
        output.ingredientId,
        organizationId,
      );
      const prior = this.readReceipt(existing?.generationBilling);
      const {
        state: _state,
        confirmedFailure: _failure,
        ...immutable
      } = receipt;
      const priorImmutable = prior
        ? (({ state: _oldState, confirmedFailure: _oldFailure, ...rest }) =>
            rest)(prior)
        : null;
      if (
        !existing ||
        !prior ||
        (output.submissionIntentProvider === 'crun' &&
          JSON.stringify(immutable) !== JSON.stringify(priorImmutable))
      )
        throw new BusinessLogicException('BYOK output linkage failed');
    }
    request.creditsConfig = {
      ...config,
      boundOutputCount: (config.boundOutputCount ?? 0) + 1,
    };
    this.logger.log('Generation BYOK usage linked', {
      organizationId,
      ingredientId: output.ingredientId,
    });
  }

  readReceipt(value: unknown): IGenerationUsageReceipt | null {
    const parsed = usageReceiptSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  readIngredient(ingredientId: string, organizationId: string) {
    return this.prisma.ingredient.findFirst({
      select: { id: true, status: true, generationBilling: true },
      where: { id: ingredientId, organizationId, isDeleted: false },
    });
  }

  async settle(
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationSettlementOutcome> {
    if (
      !(await isCrunBillingDispositionAllowed(
        this.prisma,
        ingredientId,
        organizationId,
        'settle',
      ))
    )
      return 'held';
    const ingredient = await this.readIngredient(ingredientId, organizationId);
    const receipt = this.readReceipt(ingredient?.generationBilling);
    if (!ingredient || !receipt) return 'no-hold';
    if (receipt.state === 'recorded') return 'already-settled';
    if (
      receipt.state === 'failed' ||
      !SETTLEABLE_STATUSES.includes(ingredient.status)
    )
      return 'hold-ended';
    const idempotencyKey = `media-generation-usage:${ingredientId}`;
    const recorded = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        organizationId,
        isDeleted: false,
        idempotencyKey: `byok:${organizationId}:${idempotencyKey}`,
        ...(receipt.submissionIntentProvider === 'crun'
          ? {
              category: CreditTransactionCategory.BYOK_USAGE,
              actorUserId: receipt.userId,
              amount: receipt.amount,
              source: receipt.source,
              metadata: { path: ['assetId'], equals: ingredientId },
            }
          : {}),
      }),
    });
    if (recorded)
      return acknowledgeByokUsage(
        this.prisma,
        ingredientId,
        organizationId,
        receipt,
        idempotencyKey,
      );
    const eligibility = await runCrunBillingMutation(
      this.prisma,
      ingredientId,
      organizationId,
      'settle',
      async (tx) => {
        const current = await tx.ingredient.findFirst({
          where: scopedWhere(organizationId, {
            id: ingredientId,
            organizationId,
            isDeleted: false,
          }),
          select: { generationBilling: true, status: true },
        });
        const frozen = this.readReceipt(current?.generationBilling);
        return current &&
          frozen &&
          frozen.state === 'pending' &&
          SETTLEABLE_STATUSES.includes(current.status) &&
          JSON.stringify(frozen) === JSON.stringify(receipt)
          ? ('queued' as const)
          : ('held' as const);
      },
    );
    if (eligibility === 'held') return 'held';
    await this.queue.queueByokUsage({
      amount: receipt.amount,
      description: receipt.description,
      idempotencyKey,
      metadata: {
        assetId: ingredientId,
        ...(receipt.submissionIntentProvider === 'crun'
          ? { submissionIntentProvider: 'crun' }
          : {}),
      },
      organizationId,
      source: receipt.source,
      type: 'record-byok-usage',
      userId: receipt.userId,
    });
    // Keep the receipt pending until the ledger confirms usage. Enqueue acknowledgement
    // is not proof of worker completion; a crash here is safe to reconcile.
    this.logger.log('Generation BYOK completion usage queued', {
      ingredientId,
      organizationId,
      idempotencyKey,
    });
    return 'queued';
  }

  async fail(
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationReleaseOutcome> {
    const crun = await runCrunBillingMutation(
      this.prisma,
      ingredientId,
      organizationId,
      'release',
      async (tx) => {
        const ingredient = await tx.ingredient.findFirst({
          where: { id: ingredientId, organizationId, isDeleted: false },
          select: { status: true, generationBilling: true },
        });
        const receipt = this.readReceipt(ingredient?.generationBilling);
        if (!ingredient || !receipt) return 'no-hold' as const;
        if (SETTLEABLE_STATUSES.includes(ingredient.status))
          return 'released' as const;
        await tx.ingredient.updateMany({
          where: {
            id: ingredientId,
            organizationId,
            isDeleted: false,
            generationBilling: { equals: toPrismaJson(receipt) },
            status: {
              notIn: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
            },
          },
          data: {
            generationBilling: toPrismaJson({ ...receipt, state: 'failed' }),
          },
        });
        return 'released' as const;
      },
    );
    if (crun !== undefined) return crun;
    if (
      !(await isCrunBillingDispositionAllowed(
        this.prisma,
        ingredientId,
        organizationId,
        'release',
      ))
    )
      return 'held';
    const ingredient = await this.readIngredient(ingredientId, organizationId);
    const receipt = this.readReceipt(ingredient?.generationBilling);
    if (!ingredient || !receipt) return 'no-hold';
    if (SETTLEABLE_STATUSES.includes(ingredient.status)) return 'released';
    await this.prisma.ingredient.updateMany({
      data: {
        generationBilling: toPrismaJson({ ...receipt, state: 'failed' }),
      },
      where: {
        id: ingredientId,
        organizationId,
        isDeleted: false,
        status: {
          notIn: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        },
      },
    });
    this.logger.log('Generation BYOK usage cancelled', {
      ingredientId,
      organizationId,
    });
    return 'released';
  }
}
