import {
  generationLineFundingSchema,
  storyboardSubmissionSchema,
} from '@api/helpers/utils/credits/generation-line-reservation.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import {
  crunCreditsEqual,
  normalizeCrunCredits,
  quoteModelBillableCompletion,
} from '@genfeedai/pricing';
import type { CreditReservation, CrunGenerationTask } from '@genfeedai/prisma';
import { z } from 'zod';

/** Authenticated Crun disposition protects every settlement/release/expiry entry point. */
export function crunReceiptAllowsDisposition(
  task:
    | (Pick<
        CrunGenerationTask,
        | 'state'
        | 'terminalReceipt'
        | 'quoteSnapshot'
        | 'vendorCostRecordedAt'
        | 'mediaPersistedAt'
      > &
        Partial<Pick<CrunGenerationTask, 'providerTaskId' | 'recoveryCode'>>)
    | null
    | undefined,
  disposition: 'settle' | 'release',
): boolean {
  if (!task) return true;
  if (task.recoveryCode === 'CRUN_TERMINAL_RECEIPT_CONFLICT') return false;
  if (task.state === 'prepared')
    return disposition === 'release' && !task.providerTaskId;
  const receipt = z
    .object({
      status: z.enum(['success', 'failed']).optional(),
      credits: z.string().optional(),
      isAccepted: z.literal(false).optional(),
    })
    .safeParse(task.terminalReceipt);
  if (!receipt.success) return false;
  if (
    ['provider-failed', 'finalized'].includes(task.state) &&
    receipt.data.isAccepted === false &&
    !task.providerTaskId
  )
    return disposition === 'release';
  const credits = receipt.data.credits;
  if (
    !credits ||
    normalizeCrunCredits(credits) === null ||
    !task.vendorCostRecordedAt
  )
    return false;
  if (
    ['provider-failed', 'finalized'].includes(task.state) &&
    receipt.data.status === 'failed'
  )
    return disposition === 'release';
  if (
    disposition !== 'settle' ||
    !['provider-success', 'finalized'].includes(task.state) ||
    receipt.data.status !== 'success' ||
    !task.mediaPersistedAt
  )
    return false;
  const quote = modelBillableQuoteSnapshotSchema.safeParse(task.quoteSnapshot);
  return (
    quote.success &&
    Boolean(
      quote.data.providerQuote &&
        crunCreditsEqual(
          credits,
          quote.data.providerQuote.providerCreditsPerTask,
        ),
    )
  );
}

export const generationQuoteGroupReceiptSchema = z.object({
  kind: z.literal('quote-group'),
  reservationId: z.string().min(1),
  outputIndex: z.number().int().nonnegative(),
});
export const generationQuoteGroupMetadataSchema = z
  .object({
    lineFunding: generationLineFundingSchema.optional(),
    storyboardSubmission: storyboardSubmissionSchema.optional(),
    modelQuote: modelBillableQuoteSnapshotSchema,
    boundOutputIds: z.array(z.string()).default([]),
    dispatchClosed: z.boolean().default(false),
    failedOutputIds: z.array(z.string()).default([]),
    completedArtifacts: z
      .array(
        z.object({
          ingredientId: z.string().min(1),
          s3Key: z.string().min(1),
          completedAt: z.iso.datetime(),
        }),
      )
      .default([]),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (Boolean(value.lineFunding) !== Boolean(value.storyboardSubmission))
      context.addIssue({
        code: 'custom',
        message: 'Line funding and submission protocol must coexist',
      });
    if (
      value.lineFunding &&
      value.storyboardSubmission &&
      value.lineFunding.intentHash !==
        value.storyboardSubmission.fundingIntentHash
    )
      context.addIssue({
        code: 'custom',
        message: 'Line funding and submission hashes differ',
      });
  });

/** Frozen group admission manifest; terminal proof is deliberately separate. */
export function crunGroupManifestMatches(
  hold: CreditReservation,
  tasks: CrunGenerationTask[],
): boolean {
  const parsed = generationQuoteGroupMetadataSchema.safeParse(hold.metadata);
  if (!parsed.success || !parsed.data.modelQuote.providerQuote) return false;
  const { modelQuote, boundOutputIds } = parsed.data;
  if (
    hold.amount !== modelQuote.credits ||
    modelQuote.providerQuote?.credentialSource !== 'hosted'
  )
    return false;
  const count = modelQuote.quantities.outputs ?? 1;
  if (
    boundOutputIds.length !== count ||
    new Set(boundOutputIds).size !== count ||
    tasks.length !== count
  )
    return false;
  return boundOutputIds.every((id, index) => {
    const rows = tasks.filter(
      (task) => task.ingredientId === id && task.outputIndex === index,
    );
    if (rows.length !== 1) return false;
    const task = rows[0];
    return (
      z
        .object({ kind: z.literal('reservation') })
        .strict()
        .safeParse(task.fundingBinding).success &&
      task.fundingBinding !== null &&
      typeof task.fundingBinding === 'object' &&
      !Array.isArray(task.fundingBinding) &&
      task.fundingBinding.kind === 'reservation' &&
      task.credentialSource === 'hosted' &&
      task.modelKey === modelQuote.modelKey &&
      task.inputHash === modelQuote.providerQuote?.inputHash &&
      task.contractVersion === modelQuote.providerQuote?.contractVersion &&
      task.credentialFingerprint ===
        modelQuote.providerQuote?.credentialFingerprint &&
      task.credentialId === modelQuote.providerQuote?.credentialId &&
      task.organizationId === hold.organizationId &&
      task.userId === hold.actorUserId &&
      task.reservationId === hold.id &&
      sameCrunFrozenQuote(task.quoteSnapshot, modelQuote)
    );
  });
}

/** null means incomplete/invalid proof; undefined means this is an incumbent hold. */
export function crunReservationCompletion(
  hold: CreditReservation,
  tasks: CrunGenerationTask[],
  ingredients: { id: string; s3Key: string | null }[],
): number | null | undefined {
  const raw = z
    .object({ modelQuote: modelBillableQuoteSnapshotSchema })
    .safeParse(hold.metadata);
  if (!tasks.length && (!raw.success || !raw.data.modelQuote.providerQuote))
    return undefined;
  if (!raw.success || !raw.data.modelQuote.providerQuote) return null;
  const quote = raw.data.modelQuote;
  if (hold.workloadType !== 'media-generation-group') {
    if (tasks.length !== 1) return null;
    const task = tasks[0];
    const binding = z
      .object({ kind: z.literal('reservation') })
      .strict()
      .safeParse(task.fundingBinding);
    if (
      !binding.success ||
      binding.data.kind !== 'reservation' ||
      task.credentialSource !== 'hosted' ||
      quote.providerQuote?.credentialSource !== 'hosted' ||
      task.modelKey !== quote.modelKey ||
      task.inputHash !== quote.providerQuote?.inputHash ||
      task.contractVersion !== quote.providerQuote?.contractVersion ||
      task.credentialFingerprint !==
        quote.providerQuote?.credentialFingerprint ||
      task.credentialId !== quote.providerQuote?.credentialId
    )
      return null;
    if (
      task.userId !== hold.actorUserId ||
      task.reservationId !== hold.id ||
      task.organizationId !== hold.organizationId ||
      task.ingredientId !== hold.workloadId ||
      !sameCrunFrozenQuote(task.quoteSnapshot, quote)
    )
      return null;
    if (crunReceiptAllowsDisposition(task, 'release')) return 0;
    if (!crunReceiptAllowsDisposition(task, 'settle')) return null;
    if (
      !ingredients.some(
        (ingredient) =>
          ingredient.id === task.ingredientId && Boolean(ingredient.s3Key),
      )
    )
      return null;
    const amount = quote.allocatedCredits[task.outputIndex];
    return amount === hold.amount ? amount : null;
  }
  const group = generationQuoteGroupMetadataSchema.safeParse(hold.metadata);
  if (!group.success) return null;
  if (!tasks.length && group.data.boundOutputIds.length === 0)
    return hold.amount === quote.credits ? 0 : null;
  if (!group.data.dispatchClosed) return null;
  if (!crunGroupManifestMatches(hold, tasks)) return null;
  const successes = tasks.filter((task) =>
    crunReceiptAllowsDisposition(task, 'settle'),
  );
  const failures = tasks.filter((task) =>
    crunReceiptAllowsDisposition(task, 'release'),
  );
  if (successes.length + failures.length !== tasks.length) return null;
  const completed = group.data.completedArtifacts;
  const failed = group.data.failedOutputIds;
  if (
    completed.length !== successes.length ||
    failed.length !== failures.length ||
    new Set(failed).size !== failed.length ||
    new Set(completed.map((item) => item.ingredientId)).size !==
      completed.length
  )
    return null;
  if (
    !successes.every((task) =>
      completed.some(
        (item) =>
          item.ingredientId === task.ingredientId &&
          ingredients.some(
            (ingredient) =>
              ingredient.id === task.ingredientId &&
              ingredient.s3Key === item.s3Key,
          ),
      ),
    ) ||
    !failures.every((task) => failed.includes(task.ingredientId))
  )
    return null;
  const requests = quote.quantities.requests ?? 1;
  const outputs = quote.quantities.outputs ?? 1;
  if (requests !== 1 && requests !== outputs) return null;
  const completion = quoteModelBillableCompletion(quote, {
    completedOutputs: successes.length,
    successfulRequests:
      requests === 1 ? Number(successes.length > 0) : successes.length,
  });
  return completion.status === 'unresolved' ? null : completion.credits;
}

/** Failure authority comes from the durable task, never a caller's failure flag. */
export function crunFailureKind(
  task: CrunGenerationTask | null,
): 'submission-rejected' | 'provider-terminal' | null {
  if (!task || !crunReceiptAllowsDisposition(task, 'release')) return null;
  const receipt = z
    .object({ isAccepted: z.literal(false).optional() })
    .passthrough()
    .safeParse(task.terminalReceipt);
  return task.state === 'prepared' ||
    (receipt.success && receipt.data.isAccepted === false)
    ? 'submission-rejected'
    : 'provider-terminal';
}

function canonicalCrunValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalCrunValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalCrunValue(child)]),
    );
  return value;
}
function sameCrunFrozenQuote(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalCrunValue(left)) ===
    JSON.stringify(canonicalCrunValue(right))
  );
}
