import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  crunFailureKind,
  crunReceiptAllowsDisposition,
  generationQuoteGroupReceiptSchema,
} from '@api/helpers/utils/credits/generation-quote-group.schema';
import { generationUsageReceiptSchema as usageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { submittedGenerationMetadataSchema } from '@api/helpers/utils/credits/persist-submission-failure.util';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  CreditTransactionCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { IGenerationUsageReceipt } from '@genfeedai/contracts/interfaces/billing';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { z } from 'zod';

const SETTLEABLE_STATUSES: readonly string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];
function readUsageReceipt(raw: unknown) {
  const parsed = usageReceiptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
export async function runCrunBillingMutation<T>(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
  disposition: 'settle' | 'release',
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | 'held' | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const task = await tx.crunGenerationTask.findFirst({
            where: scopedWhere(organizationId, {
              ingredientId,
              organizationId,
              isDeleted: false,
            }),
          });
          if (!task) {
            const ingredient = await tx.ingredient.findFirst({
              where: scopedWhere(organizationId, {
                id: ingredientId,
                organizationId,
                isDeleted: false,
              }),
              select: { generationBilling: true },
            });
            const receipt = readUsageReceipt(ingredient?.generationBilling);
            if (receipt?.submissionIntentProvider === 'crun')
              return 'held' as const;
            const group = generationQuoteGroupReceiptSchema.safeParse(
              ingredient?.generationBilling,
            );
            const hold = await tx.creditReservation.findFirst({
              where: scopedWhere(organizationId, {
                organizationId,
                isDeleted: false,
                ...(group.success
                  ? { id: group.data.reservationId }
                  : {
                      workloadId: ingredientId,
                      workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
                    }),
              }),
            });
            const metadata = modelBillableQuoteSnapshotSchema.safeParse(
              hold?.metadata &&
                typeof hold.metadata === 'object' &&
                !Array.isArray(hold.metadata)
                ? hold.metadata.modelQuote
                : undefined,
            );
            if (metadata.success && metadata.data.providerQuote)
              return 'held' as const;
            return undefined;
          }
          if (!crunReceiptAllowsDisposition(task, disposition))
            return 'held' as const;
          if (task.credentialSource === 'byok') {
            const ingredient = await tx.ingredient.findFirst({
              where: scopedWhere(organizationId, {
                id: ingredientId,
                organizationId,
                userId: task.userId,
                isDeleted: false,
              }),
              select: { generationBilling: true },
            });
            const usage = readUsageReceipt(ingredient?.generationBilling);
            const binding = z
              .object({
                kind: z.literal('byok'),
                receipt: usageReceiptSchema.omit({
                  kind: true,
                  state: true,
                  confirmedFailure: true,
                }),
              })
              .strict()
              .safeParse(task.fundingBinding);
            if (!usage || !binding.success) return 'held' as const;
            const {
              kind: _kind,
              state: _state,
              confirmedFailure: _failure,
              ...immutable
            } = usage;
            if (
              JSON.stringify(immutable) !== JSON.stringify(binding.data.receipt)
            )
              return 'held' as const;
          }
          return mutate(tx);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
    }
  }
}

export async function recordCrunSubmissionFailure(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
): Promise<boolean> {
  const result = await runCrunBillingMutation(
    prisma,
    ingredientId,
    organizationId,
    'release',
    async (tx) => {
      const ingredient = await tx.ingredient.findFirst({
        where: scopedWhere(organizationId, {
          id: ingredientId,
          organizationId,
          isDeleted: false,
        }),
        select: { status: true, generationBilling: true },
      });
      if (!ingredient || SETTLEABLE_STATUSES.includes(ingredient.status))
        return true;
      const receipt = readUsageReceipt(ingredient.generationBilling);
      const task = await tx.crunGenerationTask.findFirst({
        where: scopedWhere(organizationId, {
          ingredientId,
          organizationId,
          isDeleted: false,
        }),
      });
      const kind = crunFailureKind(task);
      if (!kind || !task) return true;
      if (task.reservationId) {
        const hold = await tx.creditReservation.findFirst({
          where: scopedWhere(organizationId, {
            id: task.reservationId,
            organizationId,
            isDeleted: false,
          }),
        });
        const submitted = submittedGenerationMetadataSchema.safeParse(
          hold?.metadata,
        );
        if (
          hold &&
          submitted.success &&
          submitted.data.submissionIntent.provider === 'crun'
        ) {
          if (
            submitted.data.assetId !== ingredientId ||
            hold.actorUserId !== task.userId
          )
            return true;
          const raw = z.record(z.string(), z.unknown()).parse(hold.metadata);
          const changed = await tx.creditReservation.updateMany({
            where: scopedWhere(organizationId, {
              id: hold.id,
              organizationId,
              isDeleted: false,
              status: CreditReservationStatus.RESERVED,
              metadata: { equals: toPrismaJson(raw) },
            }),
            data: {
              metadata: toPrismaJson({
                ...raw,
                confirmedFailure: {
                  version: 1,
                  ingredientId,
                  provider: 'crun',
                  kind,
                  observedAt: new Date().toISOString(),
                },
              }),
            },
          });
          if (changed.count !== 1)
            throw new BusinessLogicException('Crun failure evidence changed');
        }
      }
      await tx.ingredient.updateMany({
        where: scopedWhere(organizationId, {
          id: ingredientId,
          organizationId,
          isDeleted: false,
          status: {
            notIn: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
          ...(receipt
            ? { generationBilling: { equals: toPrismaJson(receipt) } }
            : {}),
        }),
        data: {
          status: IngredientStatus.FAILED,
          ...(receipt
            ? {
                generationBilling: toPrismaJson({
                  ...receipt,
                  state: 'failed',
                  confirmedFailure: {
                    version: 1,
                    ingredientId,
                    provider: 'crun',
                    kind,
                    observedAt: new Date().toISOString(),
                  },
                }),
              }
            : {}),
        },
      });
      return true;
    },
  );
  return result !== undefined;
}

export async function isCrunBillingDispositionAllowed(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
  disposition: 'settle' | 'release',
): Promise<boolean> {
  const task = await prisma.crunGenerationTask.findFirst({
    where: scopedWhere(organizationId, {
      ingredientId,
      organizationId,
      isDeleted: false,
    }),
  });
  return crunReceiptAllowsDisposition(task, disposition);
}

export async function acknowledgeByokUsage(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
  receipt: IGenerationUsageReceipt,
  idempotencyKey: string,
): Promise<'held' | 'already-settled'> {
  const crun = await runCrunBillingMutation(
    prisma,
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
      const frozen = readUsageReceipt(current?.generationBilling);
      if (
        !current ||
        !frozen ||
        !SETTLEABLE_STATUSES.includes(current.status) ||
        JSON.stringify(frozen) !== JSON.stringify(receipt)
      )
        return 'held' as const;
      const ledger = await tx.creditTransaction.findFirst({
        where: scopedWhere(organizationId, {
          organizationId,
          isDeleted: false,
          idempotencyKey: `byok:${organizationId}:${idempotencyKey}`,
          category: CreditTransactionCategory.BYOK_USAGE,
          actorUserId: frozen.userId,
          amount: frozen.amount,
          source: frozen.source,
          metadata: { path: ['assetId'], equals: ingredientId },
        }),
        select: { id: true },
      });
      if (!ledger) return 'held' as const;
      await tx.ingredient.updateMany({
        where: scopedWhere(organizationId, {
          id: ingredientId,
          organizationId,
          isDeleted: false,
          generationBilling: { equals: toPrismaJson(frozen) },
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        }),
        data: {
          generationBilling: toPrismaJson({ ...frozen, state: 'recorded' }),
        },
      });
      return 'already-settled' as const;
    },
  );
  if (crun !== undefined) return crun;
  await prisma.ingredient.updateMany({
    data: {
      generationBilling: toPrismaJson({ ...receipt, state: 'recorded' }),
    },
    where: scopedWhere(organizationId, {
      id: ingredientId,
      organizationId,
      isDeleted: false,
      status: {
        in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
      },
    }),
  });
  return 'already-settled';
}
