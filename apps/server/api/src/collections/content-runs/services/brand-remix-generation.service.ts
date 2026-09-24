import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  parseBrandRemixPayload,
  remixDimensions,
  staleRemixRevision,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import {
  type BrandRemixRunRecord,
  GENERATION_READY_STATUSES,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  BRAND_REMIX_RUNTIME,
  type BrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  ContentRunStatus,
  IngredientStatus,
  ModelCategory,
} from '@genfeedai/contracts';
import {
  brandRemixGenerationQuoteSchema,
  executeBrandRemixGenerationSchema,
  quoteBrandRemixGenerationSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-generation.contract';
import {
  type BrandRemixRunConfig,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  LLM_DEFAULTS,
  sourcePostVariationCredits,
} from '@genfeedai/contracts/constants';
import { ConflictException, Inject, Injectable } from '@nestjs/common';

const QUOTE_TTL_MS = 15 * 60_000;

@Injectable()
export class BrandRemixGenerationService {
  constructor(
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly runs: BrandRemixRunsService,
    private readonly imageCredits: ImageGenerationCreditsService,
    private readonly models: ModelRegistrationService,
    private readonly prisma: PrismaService,
    @Inject(BRAND_REMIX_RUNTIME) private readonly runtime: BrandRemixRuntime,
  ) {}

  async quote(
    organizationId: string,
    runId: string,
    _user: User,
    body: unknown,
  ) {
    const input = parseBrandRemixPayload(
      quoteBrandRemixGenerationSchema,
      body,
      'quote generation',
    );
    const run = await this.persistence.requireRun(organizationId, runId);
    const config = this.persistence.parseConfig(run.config, runId);
    this.assertRevision(config, input.expectedRevision);
    if (
      !['prefilled', 'failed'].includes(config.phase) ||
      config.generationClaim ||
      (config.generationQuote?.acceptedAt &&
        config.execution &&
        config.phase !== 'failed')
    ) {
      throw new ConflictException('The remix is already executing.');
    }
    if (config.phase === 'failed' && config.execution)
      throw new ConflictException(
        'Revise the saved concept and request a new quote before another paid attempt.',
      );
    const material = await this.material(
      organizationId,
      run,
      config,
      input.model,
    );
    const now = this.runtime.now();
    const quote = brandRemixGenerationQuoteSchema.parse({
      ...material.price,
      id: this.runtime.randomId(),
      revision: config.revision,
      outputKind: config.draft.output.kind,
      model: material.model,
      inputHash: material.inputHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
      count: config.draft.output.count,
      total:
        material.price.billingMode === 'byok'
          ? 0
          : material.price.unitCredits * config.draft.output.count,
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      organizationId,
      runId,
      expectedConfig: config,
      nextConfig: brandRemixRunConfigSchema.parse({
        ...config,
        generationQuote: quote,
      }),
      status: run.status as ContentRunStatus,
    });
    if (!updated)
      throw new ConflictException(
        'The remix changed while quoting. Reload and request a fresh quote.',
      );
    return this.runs.get(organizationId, runId);
  }

  async execute(
    organizationId: string,
    runId: string,
    user: User,
    request: Request,
    body: unknown,
  ) {
    const input = parseBrandRemixPayload(
      executeBrandRemixGenerationSchema,
      body,
      'execute generation',
    );
    const run = await this.persistence.requireRun(organizationId, runId);
    const config = this.persistence.parseConfig(run.config, runId);
    this.assertRevision(config, input.expectedRevision);
    const quote = config.generationQuote;
    if (
      !quote ||
      quote.id !== input.quoteId ||
      quote.revision !== config.revision
    )
      throw new ConflictException(
        'The generation quote does not match this remix revision.',
      );
    const unclaimedExecution =
      config.execution &&
      !config.execution.workflowExecutionId &&
      !config.execution.generationCredits &&
      !config.generationClaim &&
      config.execution.variants.every(
        (variant) =>
          variant.status === 'queued' && variant.assetIds.length === 0,
      );
    if (quote.acceptedAt && config.execution && !unclaimedExecution)
      return this.runs.get(organizationId, runId);
    if (new Date(quote.expiresAt).getTime() <= this.runtime.now().getTime())
      throw new ConflictException(
        'The generation quote expired. Request a fresh quote.',
      );
    const material = await this.material(
      organizationId,
      run,
      config,
      quote.outputKind === 'image' ? quote.model : undefined,
    );
    if (
      quote.inputHash !== material.inputHash ||
      quote.model !== material.model ||
      quote.pricingHash !== material.price.pricingHash ||
      quote.billingMode !== material.price.billingMode ||
      quote.unitCredits !== material.price.unitCredits ||
      quote.provider !== material.price.provider ||
      quote.count !== config.draft.output.count ||
      quote.outputKind !== config.draft.output.kind
    ) {
      throw new ConflictException(
        'Generation inputs, model or pricing changed. Request a fresh quote.',
      );
    }
    if (!quote.acceptedAt) {
      const accepted = await this.persistence.compareAndSwapExactConfig({
        organizationId,
        runId,
        expectedConfig: config,
        nextConfig: brandRemixRunConfigSchema.parse({
          ...config,
          generationQuote: {
            ...quote,
            acceptedAt: this.runtime.now().toISOString(),
          },
        }),
        status: run.status as ContentRunStatus,
      });
      if (!accepted) {
        const latest = await this.persistence.requireRun(organizationId, runId);
        const current = this.persistence.parseConfig(latest.config, runId);
        if (
          current.revision === input.expectedRevision &&
          current.generationQuote?.id === quote.id &&
          current.generationQuote.acceptedAt
        )
          return this.runs.get(organizationId, runId);
        throw new ConflictException(
          'The remix changed before quote acceptance.',
        );
      }
    }
    const approvedRequest = request as Request & DeferredCreditsRequest;
    approvedRequest.approvedRemixQuoteId = quote.id;
    approvedRequest.creditsConfig = {
      ...approvedRequest.creditsConfig,
      amount: quote.unitCredits,
      deferred: true,
      isByokBypass: quote.billingMode === 'byok',
      modelKey: quote.model,
      ...(quote.outputKind === 'image'
        ? {
            approvedImageQuote: {
              model: quote.model,
              unitCredits: quote.unitCredits,
              billingMode: quote.billingMode,
              pricingHash: quote.pricingHash,
            },
          }
        : {}),
    };
    return this.runs.start(organizationId, runId, user, request, {
      expectedRevision: input.expectedRevision,
    });
  }

  private assertRevision(config: BrandRemixRunConfig, revision: number) {
    if (config.revision !== revision)
      throw staleRemixRevision(revision, config.revision);
  }

  private async material(
    organizationId: string,
    run: BrandRemixRunRecord,
    config: BrandRemixRunConfig,
    requestedModel?: string,
  ) {
    const output = config.draft.output;
    if ((output.kind !== 'copy' && output.kind !== 'image') || output.count > 8)
      throw new ConflictException(
        'Use scene quotes for video/avatar; generic generation supports one to eight copy/image variants.',
      );
    const brandId = this.persistence.requireBrandId(run);
    const context = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );
    const source = await this.planning.resolveSource(
      organizationId,
      brandId,
      config.sourceSnapshot.selector,
    );
    const readiness = await this.planning.assertReadyForGeneration(
      organizationId,
      brandId,
      context,
      config,
    );
    const references = await this.referenceSnapshot(
      organizationId,
      brandId,
      config,
    );
    let model: string = LLM_DEFAULTS.background;
    let price: {
      unitCredits: number;
      billingMode: 'credits' | 'byok';
      provider?: string;
      pricingHash: string;
    };
    const dimensions =
      output.kind === 'image' ? remixDimensions(output.aspectRatio) : undefined;
    if (output.kind === 'image') {
      if (!requestedModel)
        throw new ConflictException(
          'Select an explicit registered image model before quoting.',
        );
      const registered = await this.models.validateModelForOrg(
        requestedModel,
        organizationId,
      );
      if (
        registered.key !== requestedModel ||
        !registered.isActive ||
        registered.isDeleted ||
        registered.category !== ModelCategory.IMAGE
      )
        throw new ConflictException(
          'The selected image model changed or is unavailable.',
        );
      model = requestedModel;
      price = await this.imageCredits.quoteCredits(
        { ...dimensions, outputs: 1, model } as CreateImageDto,
        model,
        organizationId,
      );
    } else {
      if (requestedModel !== undefined)
        throw new ConflictException(
          'Copy remixes use the canonical background model.',
        );
      const unitCredits = sourcePostVariationCredits(1);
      price = {
        unitCredits,
        billingMode: 'credits',
        pricingHash: quoteSnapshotHash({
          model,
          unitCredits,
          contract: 'source-post-variation-v1',
        }),
      };
    }
    const { savedAt: _savedAt, ...concept } = config.concept ?? {};
    const { capturedAt: _storedCapturedAt, ...storedSource } =
      config.sourceSnapshot;
    const { capturedAt: _resolvedCapturedAt, ...resolvedSource } =
      source.snapshot;
    const inputHash = quoteSnapshotHash({
      organizationId,
      runId: run.id,
      brandId,
      revision: config.revision,
      draft: config.draft,
      concept,
      sourceSnapshot: storedSource,
      resolvedSource,
      brandContext: materialContext(context),
      brief: this.planning.buildGenerationBrief(context, config),
      readiness,
      references,
      model,
      count: output.count,
      dimensions,
    });
    return { inputHash, model, price };
  }

  private async referenceSnapshot(
    organizationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
  ) {
    const ids = [
      ...new Set([
        ...config.draft.references.map((ref) => ref.assetId),
        ...('avatarAssetId' in config.draft.identity
          ? [
              config.draft.identity.avatarAssetId,
              config.draft.identity.speechVoiceId,
            ]
          : []),
      ]),
    ].sort();
    if (!ids.length) return [];
    const [ingredients, assets] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: scopedWhere(organizationId, {
          id: { in: ids },
          OR: [{ brandId }, { brandId: null }],
          status: { in: [...GENERATION_READY_STATUSES] as IngredientStatus[] },
        }),
        select: { id: true, updatedAt: true, status: true },
      }),
      this.prisma.asset.findMany({
        where: {
          parentOrgId: organizationId,
          isDeleted: false,
          id: { in: ids },
          category: AssetCategory.REFERENCE,
          OR: [{ parentBrandId: brandId }, { parentBrandId: null }],
        },
        select: { id: true, updatedAt: true },
      }),
    ]);
    const records = [
      ...ingredients.map((row) => ({ ...row, kind: 'ingredient' })),
      ...assets.map((row) => ({ ...row, kind: 'asset', status: 'available' })),
    ].sort((a, b) => a.id.localeCompare(b.id));
    if (ids.some((id) => !records.some((record) => record.id === id)))
      throw new ConflictException('A selected remix reference is unavailable.');
    return records;
  }
}

/** Operational timestamps do not change the creative material. */
function materialContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(materialContext);
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !['createdAt', 'updatedAt', 'lastUsedAt'].includes(key),
        )
        .map(([key, entry]) => [key, materialContext(entry)]),
    );
  return value;
}
