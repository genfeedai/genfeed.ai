import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type {
  GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { reserveGenerationRequestCredits } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { compensateCrunDispatchFailure } from '@api/services/integrations/crun/crun-generation-compensation.util';
import type { CrunQuoteIntentBase } from '@api/services/integrations/crun/crun-quote-input.util';
import type {
  CrunFrozenImageQuote,
  CrunFundingBinding,
  CrunPreparedTask,
} from '@api/services/integrations/crun/crun-task.schema';
import { crunFundingBindingSchema } from '@api/services/integrations/crun/crun-task.schema';
import type { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { resolveMediaGenerationReceiptSurface } from '@api/services/media-generation-receipts/media-generation-receipt-input.util';
import type { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  type ActivitySource,
  IngredientCategory,
  IngredientOrigin,
  type MetadataExtension,
  type PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

export type CrunBillingRequest = RequestWithContext & GenerationBillingRequest;
export type CrunCreatedMedia = Awaited<
  ReturnType<SharedService['createMediaDocuments']>
>;

/** Fields of a frozen quote the dispatch reads; image and video quotes satisfy it. */
export interface CrunFrozenQuoteBase
  extends Omit<CrunFrozenImageQuote, 'intent'> {
  intent: { model: string };
}

export interface CrunDispatchIntent extends CrunQuoteIntentBase {
  style?: string;
}

export interface CrunGenerationDeps {
  billing: Pick<
    GenerationBillingService,
    | 'abortUnsubmittedOutput'
    | 'bindOutput'
    | 'recordSubmissionRejection'
    | 'releasePool'
  >;
  credits: CreditsUtilsService;
  prisma: PrismaService;
  prompts: PromptsService;
  /** Generation receipts; writes run detached and never gate dispatch. */
  receipts: Pick<
    MediaGenerationReceiptsService,
    'open' | 'recordAccepted' | 'syncTerminal'
  >;
  shared: SharedService;
  tasks: Pick<
    CrunTaskService,
    'failPrepared' | 'findForIngredient' | 'prepareTasks' | 'submit'
  >;
}

/** What differs between media kinds in the reserve, create, submit, release dispatch. */
export interface CrunGenerationStrategy<
  TIntent extends CrunDispatchIntent,
  TFrozen extends CrunFrozenQuoteBase,
> {
  readonly activitySource: ActivitySource;
  readonly category: IngredientCategory;
  readonly defaultDescription: string;
  /**
   * Whether a failed funding preflight (quote still current, credit balance)
   * runs inside the compensated region. Video does; image refuses before any
   * funding exists.
   */
  readonly isPreflightCompensated: boolean;
  readonly promptCategory: PromptCategory;
  assertCurrent(frozen: TFrozen): Promise<void>;
  /** Cache or other side effects that must precede the task rows' first submit. */
  beforeSubmit?(): Promise<void>;
  /** The container extension for each generated output. */
  extension(frozen: TFrozen): MetadataExtension;
  normalize(raw: Record<string, unknown>, user: AuthenticatedUser): TIntent;
  /** Parent ingredient of each output, when the media has one. */
  parentId?(intent: TIntent): string | undefined;
  referenceCount(intent: TIntent): number;
  resolveOutputPersonaId(
    intent: TIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<string | null>;
  /** Source ingredient ids linked to each output. */
  sourceIds(intent: TIntent): string[];
}

type ProviderQuote = NonNullable<
  CrunFrozenQuoteBase['snapshot']['providerQuote']
>;

export async function dispatchFrozenCrunGeneration<
  TIntent extends CrunDispatchIntent,
  TFrozen extends CrunFrozenQuoteBase,
>(
  deps: CrunGenerationDeps,
  strategy: CrunGenerationStrategy<TIntent, TFrozen>,
  params: {
    billingRequest: CrunBillingRequest;
    frozen: TFrozen;
    raw: Record<string, unknown>;
    user: AuthenticatedUser;
  },
): Promise<CrunCreatedMedia[]> {
  const { billingRequest, frozen, user } = params;
  const createdIngredientIds: string[] = [];
  let funding: { intent: TIntent; provider: ProviderQuote } | undefined;
  if (!strategy.isPreflightCompensated)
    funding = await reserveFunding(deps, strategy, params);
  let ingredients: CrunCreatedMedia[];
  try {
    const { intent, provider } =
      funding ?? (await reserveFunding(deps, strategy, params));
    await reserveGenerationRequestCredits({
      amount: frozen.snapshot.credits,
      creditsUtilsService: deps.credits,
      organizationId: user.organizationId,
      request: billingRequest,
    });
    const bound = await createBoundOutputs(deps, strategy, {
      billingRequest,
      createdIngredientIds,
      frozen,
      intent,
      provider,
      user,
    });
    ingredients = bound.ingredients;
    await strategy.beforeSubmit?.();
    await submitPreparedOutputs(deps, frozen, bound.rows, {
      billingRequest,
      user,
    });
  } catch (error: unknown) {
    await compensateCrunDispatchFailure(
      { tasks: deps.tasks, billing: deps.billing, receipts: deps.receipts },
      {
        organizationId: user.organizationId,
        ingredientIds: createdIngredientIds,
        billingRequest,
      },
    );
    throw error;
  }
  return ingredients;
}

async function reserveFunding<
  TIntent extends CrunDispatchIntent,
  TFrozen extends CrunFrozenQuoteBase,
>(
  deps: CrunGenerationDeps,
  strategy: CrunGenerationStrategy<TIntent, TFrozen>,
  params: {
    billingRequest: CrunBillingRequest;
    frozen: TFrozen;
    raw: Record<string, unknown>;
    user: AuthenticatedUser;
  },
): Promise<{ intent: TIntent; provider: ProviderQuote }> {
  const { billingRequest, frozen, raw, user } = params;
  await strategy.assertCurrent(frozen);
  const provider = frozen.snapshot.providerQuote;
  if (!provider) throw new ConflictException({ code: 'CRUN_QUOTE_STALE' });
  const intent = strategy.normalize(raw, user);
  if (
    provider.credentialSource === 'hosted' &&
    frozen.snapshot.credits > 0 &&
    !(await deps.credits.checkOrganizationCreditsAvailable(
      user.organizationId,
      frozen.snapshot.credits,
    ))
  ) {
    const balance = await deps.credits.getOrganizationCreditsBalance(
      user.organizationId,
    );
    throw createInsufficientCreditsException(frozen.snapshot.credits, balance);
  }
  billingRequest.creditsConfig = {
    ...billingRequest.creditsConfig,
    amount: frozen.snapshot.credits,
    deferred: false,
    modelKey: intent.model,
    modelQuote: frozen.snapshot,
    settlement: 'completion',
    source: strategy.activitySource,
    description:
      billingRequest.creditsConfig?.description ?? strategy.defaultDescription,
    isByokBypass: provider.credentialSource === 'byok',
  };
  return { intent, provider };
}

async function createBoundOutputs<
  TIntent extends CrunDispatchIntent,
  TFrozen extends CrunFrozenQuoteBase,
>(
  deps: CrunGenerationDeps,
  strategy: CrunGenerationStrategy<TIntent, TFrozen>,
  params: {
    billingRequest: CrunBillingRequest;
    createdIngredientIds: string[];
    frozen: TFrozen;
    intent: TIntent;
    provider: ProviderQuote;
    user: AuthenticatedUser;
  },
): Promise<{ ingredients: CrunCreatedMedia[]; rows: CrunPreparedTask[] }> {
  const {
    billingRequest,
    createdIngredientIds,
    frozen,
    intent,
    provider,
    user,
  } = params;
  const prompt = intent.promptId
    ? { id: intent.promptId }
    : await deps.prompts.create({
        original: intent.text,
        enhanced: intent.text,
        category: strategy.promptCategory,
        status: PromptStatus.GENERATED,
        userId: user.userId,
        organizationId: user.organizationId,
        brandId: frozen.brandId,
      });
  const personaId = await strategy.resolveOutputPersonaId(
    intent,
    user,
    frozen.brandId,
  );
  const rows: CrunPreparedTask[] = [];
  const ingredients: CrunCreatedMedia[] = [];
  for (
    let outputIndex = 0;
    outputIndex < (intent.outputs ?? 1);
    outputIndex++
  ) {
    const docs = await deps.shared.createMediaDocuments(user, {
      origin: IngredientOrigin.GENERATED,
      category: strategy.category,
      brandId: frozen.brandId,
      organizationId: user.organizationId,
      personaId,
      promptId: prompt.id,
      extension: strategy.extension(frozen),
      model: intent.model,
      generationPrompt: String(frozen.request.input.prompt),
      generationSource: 'studio',
      sourceIds: strategy.sourceIds(intent),
      parentId: strategy.parentId?.(intent),
      promptTemplate: frozen.templateUsed,
      templateVersion: frozen.templateVersion,
      groupId: frozen.quoteId,
      groupIndex: outputIndex,
      style: intent.style,
    });
    ingredients.push(docs);
    createdIngredientIds.push(docs.ingredientData.id);
    openOutputReceipt(deps, strategy, params, {
      ingredientId: docs.ingredientData.id,
      firstIngredientId: ingredients[0].ingredientData.id,
    });
    if (intent.folderId)
      await deps.prisma.ingredient.updateMany({
        where: {
          id: docs.ingredientData.id,
          organizationId: user.organizationId,
          isDeleted: false,
        },
        data: { folderId: intent.folderId },
      });
    await deps.billing.bindOutput(billingRequest, {
      ingredientId: docs.ingredientData.id,
      credits:
        provider.credentialSource === 'byok'
          ? frozen.snapshot.credits / (intent.outputs ?? 1)
          : frozen.snapshot.allocatedCredits[outputIndex],
      submissionIntentProvider: 'crun',
    });
    rows.push({
      organizationId: user.organizationId,
      userId: user.userId,
      ingredientId: docs.ingredientData.id,
      brandId: frozen.brandId,
      reservationId:
        provider.credentialSource === 'hosted' && frozen.snapshot.credits > 0
          ? (billingRequest.creditsConfig?.reservationId ?? null)
          : null,
      fundingBinding: await resolveFundingBinding(
        deps,
        user,
        frozen,
        provider,
        docs.ingredientData.id,
      ),
      modelKey: intent.model,
      endpoint: frozen.request.model,
      contractVersion: provider.contractVersion,
      quoteId: frozen.quoteId,
      outputIndex,
      inputHash: provider.inputHash,
      inputMetadata: {
        referenceCount: strategy.referenceCount(intent),
        intentHash: frozen.intentHash,
      },
      quoteSnapshot: toPrismaJson(frozen.snapshot) as Prisma.InputJsonObject,
      credentialSource: provider.credentialSource,
      credentialId: provider.credentialId,
      credentialFingerprint: provider.credentialFingerprint,
    });
  }
  return { ingredients, rows };
}

/**
 * Opens the generation receipt of one created output. Studio media applies no
 * brand identity, so the receipt is raw: it records the typed prompt, the
 * enhanced prompt when enhancement replaced it, and the prompt Crun receives.
 */
function openOutputReceipt<
  TIntent extends CrunDispatchIntent,
  TFrozen extends CrunFrozenQuoteBase,
>(
  deps: CrunGenerationDeps,
  strategy: CrunGenerationStrategy<TIntent, TFrozen>,
  params: {
    billingRequest: CrunBillingRequest;
    frozen: TFrozen;
    intent: TIntent;
    user: AuthenticatedUser;
  },
  output: { ingredientId: string; firstIngredientId: string },
): void {
  const { billingRequest, frozen, intent, user } = params;
  const typed = billingRequest.generationOriginalPrompt;
  const isEnhanced = typed !== undefined && typed !== intent.text;
  const submitted = frozen.request.input.prompt;
  void deps.receipts.open({
    organizationId: user.organizationId,
    brandId: frozen.brandId,
    actorId: user.userId,
    isApiKey: user.isApiKey,
    apiKeyId: user.apiKeyId,
    scopes: user.scopes,
    ingredientId: output.ingredientId,
    parentIngredientId: output.firstIngredientId,
    mediaKind:
      strategy.category === IngredientCategory.VIDEO ? 'video' : 'image',
    surface: resolveMediaGenerationReceiptSurface(),
    provider: 'crun',
    model: intent.model,
    originalPrompt: isEnhanced ? typed : intent.text,
    ...(isEnhanced ? { enhancedPrompt: intent.text } : {}),
    compiledPrompt:
      typeof submitted === 'string' && submitted.trim()
        ? submitted
        : intent.text,
    generationParameters: {
      outputs: intent.outputs ?? 1,
      quoteId: frozen.quoteId,
      ...(intent.style ? { style: intent.style } : {}),
    },
  });
}

async function resolveFundingBinding(
  deps: CrunGenerationDeps,
  user: AuthenticatedUser,
  frozen: CrunFrozenQuoteBase,
  provider: ProviderQuote,
  ingredientId: string,
): Promise<CrunFundingBinding> {
  if (provider.credentialSource !== 'byok')
    return frozen.snapshot.credits > 0
      ? { kind: 'reservation' }
      : { kind: 'free' };
  const linked = await deps.prisma.ingredient.findFirst({
    where: {
      id: ingredientId,
      organizationId: user.organizationId,
      isDeleted: false,
    },
    select: { generationBilling: true },
  });
  const receipt = generationUsageReceiptSchema.parse(linked?.generationBilling);
  const {
    kind: _kind,
    state: _state,
    confirmedFailure: _failure,
    ...immutable
  } = receipt;
  return crunFundingBindingSchema.parse({ kind: 'byok', receipt: immutable });
}

async function submitPreparedOutputs(
  deps: CrunGenerationDeps,
  frozen: CrunFrozenQuoteBase,
  rows: CrunPreparedTask[],
  params: { billingRequest: CrunBillingRequest; user: AuthenticatedUser },
): Promise<void> {
  const { billingRequest, user } = params;
  const prepared = await deps.tasks.prepareTasks(rows);
  // Every durable row and binding precedes the first paid request. Never regenerate effective input here.
  for (const task of prepared) {
    const result = await deps.tasks.submit(task, frozen.request);
    if (result.isSubmitted) {
      if (result.taskId)
        void deps.receipts.recordAccepted({
          organizationId: user.organizationId,
          ingredientId: task.ingredientId,
          provider: 'crun',
          model: task.modelKey,
          externalId: result.taskId,
        });
      continue;
    }
    const persisted = await deps.tasks.findForIngredient(
      user.organizationId,
      task.ingredientId,
    );
    if (
      persisted?.state === 'provider-failed' &&
      persisted.providerTaskId === null
    ) {
      await deps.billing.recordSubmissionRejection(
        task.ingredientId,
        user.organizationId,
      );
      void deps.receipts.syncTerminal(
        user.organizationId,
        task.ingredientId,
        'released',
      );
    }
    // Ambiguous acceptance remains funded. No outcome is automatically redispatched.
  }
  await deps.billing.releasePool(billingRequest);
}
