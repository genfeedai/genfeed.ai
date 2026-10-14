import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationArtifactBindingV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type {
  LocatedMediaGenerationReceiptV1 as LocatedMediaReceipt,
  MediaGenerationReceiptAcceptanceV1,
  MediaGenerationReceiptBrandV1,
  MediaGenerationReceiptKindV1,
  MediaGenerationReceiptOpenInputV1,
  MediaGenerationTerminalSignalV1,
} from '@api/services/media-generation-receipts/media-generation-receipts.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { MEDIA_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, HttpException, Injectable } from '@nestjs/common';

const COMPLETED_STATUSES: ReadonlySet<string> = new Set<string>([
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
]);
const FAILED_STATUSES: ReadonlySet<string> = new Set<string>([
  IngredientStatus.FAILED,
  IngredientStatus.REJECTED,
]);
const MEDIA_CATEGORIES: ReadonlyMap<string, MediaGenerationReceiptKindV1> =
  new Map<string, MediaGenerationReceiptKindV1>([
    [IngredientCategory.IMAGE, 'image'],
    [IngredientCategory.VIDEO, 'video'],
  ]);
/** Binding failures that a later retry cannot fix. */
const UNBINDABLE_ARTIFACT_CODES: ReadonlySet<string> = new Set([
  'receipt_material_limit_exceeded',
  'receipt_artifact_unsupported',
  'receipt_artifact_not_found',
]);
/** Receipt services raise stable codes; the JSON:API 404 carries it as detail. */
function receiptErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    for (const key of ['detail', 'message'] as const) {
      const value = Reflect.get(response, key);
      if (typeof value === 'string') return value;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

const GENERATION_COST_ID = 'generation';
const CHARGED_HOLD_STATUSES: ReadonlySet<string> = new Set<string>([
  CreditReservationStatus.RESERVED,
  CreditReservationStatus.SETTLED,
]);

/**
 * Records Studio image and video generations as generation receipts (#6484,
 * #5786): raw when no brand applied, otherwise pinned to the approved or
 * provisional revision the prompt was enhanced against. One receipt per output ingredient, keyed by the ingredient
 * id: opened when the output is admitted for dispatch, dispatched when the
 * provider accepts it, and settled from the ingredient's terminal status.
 *
 * Receipts are evidence, never a gate: every write is serialized per output in
 * this process, runs off the generation path, and logs instead of throwing.
 */
@Injectable()
export class MediaGenerationReceiptsService {
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly material: BrandedGenerationArtifactMaterialService,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly logger: LoggerService,
  ) {}

  /** Starts the receipt for one admitted output; never awaits the write. */
  open(input: MediaGenerationReceiptOpenInputV1): Promise<void> {
    return this.track(input.organizationId, input.ingredientId, 'open', () =>
      this.create(input),
    );
  }

  /** Records provider acceptance once the receipt is resolved. */
  recordAccepted(input: MediaGenerationReceiptAcceptanceV1): Promise<void> {
    return this.track(
      input.organizationId,
      input.ingredientId,
      'dispatch',
      async () => {
        const located = await this.locate(
          input.organizationId,
          input.ingredientId,
        );
        if (located?.receipt.state === 'resolved')
          await this.dispatch(located, input.provider, input.model, [
            input.externalId,
          ]);
      },
    );
  }

  /**
   * Moves the receipt to the outcome the output's ingredient reached. Called
   * from the media completion contract (hold settle/release) for every output;
   * outputs without a receipt are ignored. A released hold whose ingredient is
   * still processing is a failure that has not been persisted yet.
   */
  syncTerminal(
    organizationId: string,
    ingredientId: string,
    signal: MediaGenerationTerminalSignalV1,
  ): Promise<void> {
    return this.track(organizationId, ingredientId, signal, async () => {
      const located = await this.locate(organizationId, ingredientId);
      if (!located) return;
      const { status } = located.ingredient;
      if (COMPLETED_STATUSES.has(status))
        await this.complete(located, ingredientId);
      else if (
        FAILED_STATUSES.has(status) ||
        (signal === 'released' && status === IngredientStatus.PROCESSING)
      )
        await this.fail(located);
    });
  }

  private track(
    organizationId: string,
    ingredientId: string,
    step: string,
    run: () => Promise<void>,
  ): Promise<void> {
    const key = `${organizationId}:${ingredientId}`;
    const next = (this.inflight.get(key) ?? Promise.resolve())
      .then(run)
      .catch((error: unknown) => {
        this.logger.warn('Media generation receipt write failed', {
          error: receiptErrorCode(error),
          ingredientId,
          organizationId,
          step,
        });
      });
    this.inflight.set(key, next);
    void next.finally(() => {
      if (this.inflight.get(key) === next) this.inflight.delete(key);
    });
    return next;
  }

  private async create(input: MediaGenerationReceiptOpenInputV1) {
    const actor: BrandedGenerationActorV1 = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      actorId: input.actorId,
      ...(input.isApiKey ? { isApiKey: true } : {}),
      ...(input.apiKeyId ? { apiKeyId: input.apiKeyId } : {}),
      ...(input.scopes ? { scopes: input.scopes } : {}),
    };
    const snapshot = input.brand
      ? await this.captureBrand(actor, input.brand)
      : null;
    const request: BrandedGenerationInputV1 = {
      schemaVersion: 1,
      actorId: input.actorId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      requestKey: input.ingredientId,
      candidateIndex: 0,
      surface: input.surface,
      contentType: input.mediaKind,
      format: input.mediaKind,
      mode: input.brand?.mode ?? 'raw',
      ...(input.brand?.mode === 'provisional_brand'
        ? { draftRevisionId: input.brand.revisionId }
        : {}),
      originalPrompt: input.originalPrompt,
      provider: input.provider,
      model: input.model,
      generationParameters: input.generationParameters,
      knowledgeSourceIds: [],
      knowledgeSpaceIds: [],
      generationId: input.ingredientId,
      ...(input.parentIngredientId &&
      input.parentIngredientId !== input.ingredientId
        ? { parentRequestId: input.parentIngredientId }
        : {}),
    };
    const { receipt } = await this.receipts.create(request, actor);
    if (receipt.state !== 'created') return;
    await this.receipts.recordResolution(
      actor,
      receipt.id,
      this.mutation(receipt, 'resolve'),
      this.resolution(input, snapshot),
      input.enhancedPrompt,
    );
  }

  /**
   * Re-captures the pinned revision through the snapshot seam. A revision that
   * changed since enhancement is never recorded as the one the prompt used.
   */
  private async captureBrand(
    actor: BrandedGenerationActorV1,
    brand: MediaGenerationReceiptBrandV1,
  ): Promise<BrandIdentitySnapshotV1> {
    const snapshot =
      brand.mode === 'approved_brand'
        ? await this.snapshots.preview(actor)
        : await this.snapshots.previewProvisional(actor, brand.revisionId);
    if (
      snapshot.revisionId !== brand.revisionId ||
      snapshot.revisionVersion !== brand.revisionVersion
    )
      throw new ConflictException('brand_identity_changed');
    return snapshot;
  }

  /**
   * A media output applies the pinned brand identity (when it has one) through
   * enhancement only: no layers or learning are claimed, so a branded output
   * is never marked compliant without a validation report.
   */
  private resolution(
    input: MediaGenerationReceiptOpenInputV1,
    snapshot: BrandIdentitySnapshotV1 | null,
  ): BrandedGenerationResolutionV1 {
    return {
      schemaVersion: 1,
      mode: input.brand?.mode ?? 'raw',
      status: 'resolved',
      compiledPrompt: input.compiledPrompt,
      originalPromptHash: hashBrandedGenerationTextV1(input.originalPrompt),
      snapshot,
      layers: [],
      diagnostics: [],
      learning: {
        schemaVersion: 1,
        brandFeedback: { status: 'not_applicable', sourceIds: [] },
        global: {
          status: 'not_applicable',
          scope: { format: input.mediaKind, objective: 'engagement' },
        },
        privateAccount: {
          mode: 'no_destination',
          configVersion: 'media-raw-v1',
          synthetic: false,
          application: {
            status: 'unavailable',
            reasonCodes: ['no_destination'],
            privatePolicyApplied: false,
            sharedReleaseApplied: false,
            revalidatedAt: new Date().toISOString(),
          },
        },
      },
    };
  }

  private async locate(
    organizationId: string,
    ingredientId: string,
  ): Promise<LocatedMediaReceipt | null> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, organizationId, isDeleted: false },
      select: {
        brandId: true,
        category: true,
        status: true,
        metadata: {
          select: { model: true, externalId: true, externalProvider: true },
        },
      },
    });
    if (!ingredient?.brandId || !MEDIA_CATEGORIES.has(ingredient.category))
      return null;
    const row = await this.prisma.brandedGenerationReceipt.findFirst({
      where: {
        organizationId,
        brandId: ingredient.brandId,
        requestKey: ingredientId,
        candidateIndex: 0,
        isDeleted: false,
      },
      select: { projection: true },
    });
    if (!row) return null;
    const parsed = brandedGenerationReceiptV1Schema.safeParse(row.projection);
    if (!parsed.success) return null;
    return {
      actor: {
        organizationId,
        brandId: ingredient.brandId,
        actorId: parsed.data.actorId,
      },
      receipt: parsed.data,
      ingredient: {
        status: String(ingredient.status),
        category: String(ingredient.category),
        metadata: ingredient.metadata,
      },
    };
  }

  private async dispatch(
    located: LocatedMediaReceipt,
    provider: string,
    model: string,
    externalIds: Array<string | null | undefined>,
  ): Promise<BrandedGenerationReceiptV1 | null> {
    const externalId = externalIds.find((value) => value?.trim());
    const providerAttemptRef = `${provider}:${externalId ?? ''}`;
    if (
      !externalId ||
      !learningContractIdSchema.safeParse(providerAttemptRef).success
    ) {
      await this.receipts.blockBeforeDispatch(
        located.actor,
        located.receipt.id,
        this.mutation(located.receipt, 'block'),
        'provider_attempt_ref_unavailable',
      );
      return null;
    }
    // The receipt observes acceptance; it never claims an earlier dispatch time.
    const observedAt = new Date().toISOString();
    const { receipt } = await this.receipts.recordDispatch(
      located.actor,
      located.receipt.id,
      this.mutation(located.receipt, 'dispatch'),
      {
        provider,
        model,
        providerAttemptRef,
        dispatchClaimedAt: observedAt,
        providerAcceptedAt: observedAt,
      },
    );
    return receipt;
  }

  /** Drives a completed output through whatever receipt steps remain. */
  private async complete(located: LocatedMediaReceipt, ingredientId: string) {
    let current: BrandedGenerationReceiptV1 | null = located.receipt;
    if (current.state === 'resolved') {
      // Acceptance was never observed in this process; recover it from the
      // provider evidence the completion path persisted.
      const metadata = located.ingredient.metadata;
      current = await this.dispatch(
        located,
        metadata?.externalProvider ?? 'unknown',
        metadata?.model ?? 'unknown',
        [metadata?.externalId],
      );
    }
    if (current?.state === 'dispatched')
      current = await this.bind(located, current, ingredientId);
    if (current?.state === 'checking')
      current = (
        await this.receipts.recordValidation(
          located.actor,
          current.id,
          this.mutation(current, 'validate'),
          'validate',
          null,
        )
      ).receipt;
    const isDelivered =
      current?.state === 'ready' ||
      current?.state === 'needs_review' ||
      (current?.state === 'blocked' &&
        current.execution?.result === 'completed');
    if (
      current &&
      isDelivered &&
      !current.costs.some((cost) => cost.id === GENERATION_COST_ID)
    )
      await this.recordCost(located, current, ingredientId);
  }

  /**
   * Binds the stored output to the receipt. An output that can never be
   * fingerprinted (too large, unsupported, gone) is recorded as completed
   * without an artifact claim; transient storage errors are retried by the
   * next completion signal.
   */
  private async bind(
    located: LocatedMediaReceipt,
    current: BrandedGenerationReceiptV1,
    ingredientId: string,
  ): Promise<BrandedGenerationReceiptV1> {
    const completedAt = new Date().toISOString();
    let binding: BrandedGenerationArtifactBindingV1;
    try {
      binding = await this.material.describeIngredientArtifact(
        located.actor,
        ingredientId,
      );
    } catch (error: unknown) {
      const code = receiptErrorCode(error);
      if (!UNBINDABLE_ARTIFACT_CODES.has(code)) throw error;
      return (
        await this.receipts.blockUnboundCompletion(
          located.actor,
          current.id,
          this.mutation(current, 'unbound'),
          { reasonCode: code, completedAt },
        )
      ).receipt;
    }
    return (
      await this.receipts.bindArtifact(
        located.actor,
        current.id,
        this.mutation(current, 'bind'),
        { ...binding, completedAt },
      )
    ).receipt;
  }

  private async fail(located: LocatedMediaReceipt) {
    const { actor, receipt } = located;
    if (receipt.state === 'created')
      await this.receipts.cancel(
        actor,
        receipt.id,
        this.mutation(receipt, 'cancel'),
      );
    else if (receipt.state === 'resolved')
      await this.receipts.blockBeforeDispatch(
        actor,
        receipt.id,
        this.mutation(receipt, 'block'),
        'provider_submission_failed',
      );
    else if (receipt.state === 'dispatched')
      await this.receipts.fail(
        actor,
        receipt.id,
        this.mutation(receipt, 'fail'),
        {
          reasonCode: 'provider_generation_failed',
          completedAt: new Date().toISOString(),
        },
      );
  }

  /** The output's own credit hold is the ledger entry that pays for it. */
  private async recordCost(
    located: LocatedMediaReceipt,
    receipt: BrandedGenerationReceiptV1,
    ingredientId: string,
  ) {
    const hold = await this.prisma.creditReservation.findFirst({
      where: {
        organizationId: located.actor.organizationId,
        workloadId: ingredientId,
        workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, settledAmount: true, status: true },
    });
    const cost: BrandedGenerationReceiptV1['costs'][number] =
      hold && CHARGED_HOLD_STATUSES.has(String(hold.status))
        ? {
            id: GENERATION_COST_ID,
            stage: 'generation',
            status: 'known',
            ledgerId: hold.id,
            credits: hold.settledAmount ?? hold.amount,
          }
        : {
            id: GENERATION_COST_ID,
            stage: 'generation',
            status: 'unavailable',
            reasonCode: 'credit_hold_unavailable',
          };
    await this.receipts.recordCosts(
      located.actor,
      receipt.id,
      this.mutation(receipt, 'costs'),
      [cost],
    );
  }

  private mutation(receipt: BrandedGenerationReceiptV1, step: string) {
    return {
      operationKey: `${receipt.id}:${step}`,
      expectedRevision: receipt.revision,
    };
  }
}
