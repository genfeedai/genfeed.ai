import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { CrunVideoQuoteIntent } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { CrunVideoInputService } from '@api/collections/videos/services/crun-video-input.service';
import { CrunVideoPreviewQuoteService } from '@api/collections/videos/services/crun-video-preview-quote.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { CacheService } from '@api/services/cache/cache.service';
import { CRUN_VIDEO_MANIFEST } from '@api/services/integrations/crun/contracts/crun-manifest';
import {
  type CrunGenerationStrategy,
  dispatchFrozenCrunGeneration,
} from '@api/services/integrations/crun/crun-generation-lifecycle';
import type { CrunFrozenVideoQuote } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivitySource,
  IngredientCategory,
  MetadataExtension,
  PromptCategory,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  getDeserializer,
  isDeserializerRuntime,
  type JsonApiDocument,
} from '@genfeedai/helpers';
import { VideoSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/** Allowed video models come from the reviewed Crun manifest, not a literal list. */
const CRUN_VIDEO_MODEL_KEYS: readonly string[] = CRUN_VIDEO_MANIFEST.map(
  (entry) => entry.key,
);

const INTENT_FIELDS = [
  'model',
  'text',
  'brandId',
  'folderId',
  'promptId',
  'references',
  'endFrame',
  'parentId',
  'outputs',
  'crunControls',
  'style',
  'mood',
  'camera',
  'lens',
  'scene',
  'lighting',
  'fontFamily',
  'blacklist',
  'brandingMode',
  'isBrandingEnabled',
  'promptTemplate',
  'useTemplate',
  'harness',
  'requestedSkillSlugs',
  'knowledge',
] as const;

@Injectable()
export class CrunVideoGenerationService {
  constructor(
    private readonly preview: CrunVideoPreviewQuoteService,
    private readonly input: CrunVideoInputService,
    private readonly tasks: CrunTaskService,
    private readonly billing: GenerationBillingService,
    private readonly credits: CreditsUtilsService,
    private readonly shared: SharedService,
    private readonly prompts: PromptsService,
    private readonly videos: VideosService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private readonly strategy: CrunGenerationStrategy<
    CrunVideoQuoteIntent,
    CrunFrozenVideoQuote
  > = {
    activitySource: ActivitySource.VIDEO_GENERATION,
    category: IngredientCategory.VIDEO,
    defaultDescription: 'Video generation',
    isPreflightCompensated: true,
    promptCategory: PromptCategory.MODELS_PROMPT_VIDEO,
    assertCurrent: (frozen) => this.preview.assertCurrent(frozen),
    beforeSubmit: () => this.cache.invalidateByTags(['videos']),
    extension: () => MetadataExtension.MP4,
    normalize: (raw, user) => this.input.normalize(raw, user),
    parentId: (intent) => intent.parentId,
    referenceCount: (intent) =>
      (intent.references?.length ?? 0) + (intent.endFrame ? 1 : 0),
    resolveOutputPersonaId: (intent, user, brandId) =>
      this.input.resolveOutputPersonaId(intent, user, brandId),
    sourceIds: (intent) => [
      ...(intent.references ?? []),
      ...(intent.endFrame ? [intent.endFrame] : []),
    ],
  };

  async generate(
    user: AuthenticatedUser,
    dto: CreateVideoDto,
    request: RequestWithContext,
  ): Promise<JsonApiSingleResponse> {
    const billingRequest = request as RequestWithContext &
      GenerationBillingRequest;
    const { raw, consumed } = await this.prepareQuoteConsumption(
      user,
      dto,
      request,
    );
    if (consumed.kind === 'replay')
      return this.serializeReplay(user, request, consumed.ingredientIds);
    const frozen = consumed.quote;
    const ingredients = await dispatchFrozenCrunGeneration(
      {
        billing: this.billing,
        credits: this.credits,
        prisma: this.prisma,
        prompts: this.prompts,
        shared: this.shared,
        tasks: this.tasks,
      },
      this.strategy,
      { billingRequest, frozen, raw, user },
    );
    const first = await this.videos.findOne({
      id: ingredients[0].ingredientData.id,
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!first) throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
    return serializeSingle(request, VideoSerializer, {
      ...first,
      pendingIngredientIds: ingredients.map((docs) => docs.ingredientData.id),
    });
  }

  private async prepareQuoteConsumption(
    user: AuthenticatedUser,
    dto: CreateVideoDto,
    request: RequestWithContext,
  ) {
    if (
      (request as DeferredCreditsRequest).approvedRemixQuoteId !== undefined ||
      (dto as CreateVideoDto & { approvedRemixQuoteId?: string })
        .approvedRemixQuoteId !== undefined ||
      (request as DeferredCreditsRequest).creditsConfig?.approvedImageQuote !==
        undefined
    )
      throw new BadRequestException({ code: 'CRUN_BILLING_UNSUPPORTED' });
    const { intent: raw, quoteId: suppliedQuoteId } = this.originalIntent(
      dto,
      request,
    );
    if (raw.crunControls !== undefined) this.input.normalize(raw, user);
    if (
      request.generationOriginalPrompt !== undefined &&
      request.generationOriginalPrompt !== (dto.text ?? '').trim()
    ) {
      if (!dto.promptId)
        throw new BadRequestException({ code: 'CRUN_ENHANCEMENT_REQUIRED' });
      const provenance = await this.prisma.prompt.findFirst({
        where: {
          id: dto.promptId,
          organizationId: user.organizationId,
          userId: user.userId,
          brandId: typeof raw.brandId === 'string' ? raw.brandId : user.brandId,
          isDeleted: false,
        },
        select: { original: true, enhanced: true },
      });
      if (
        !provenance ||
        provenance.original !== request.generationOriginalPrompt ||
        provenance.enhanced !== (dto.text ?? '').trim()
      )
        throw new BadRequestException({ code: 'CRUN_ENHANCEMENT_REQUIRED' });
    }
    if (!raw.crunControls) {
      const model = await this.prisma.model.findFirst({
        where: {
          key: dto.model,
          isDeleted: false,
          isActive: true,
          OR: [
            { organizationId: null },
            { organizationId: user.organizationId },
          ],
        },
        select: { reviewedProviderContractVersion: true },
      });
      if (!model?.reviewedProviderContractVersion)
        throw new ConflictException({ code: 'CRUN_QUOTE_STALE' });
      raw.crunControls = {
        contractVersion: model.reviewedProviderContractVersion,
      };
    }
    let quoteId = suppliedQuoteId;
    if (!quoteId) {
      const quoted = await this.preview.preview(raw, user);
      if (!quoted.isAvailable)
        throw new BadRequestException({ code: quoted.reasonCode });
      quoteId = quoted.quoteId;
    }
    const consumed = await this.preview.consume(raw, quoteId, user);
    return { raw, consumed };
  }

  private async serializeReplay(
    user: AuthenticatedUser,
    request: RequestWithContext,
    ingredientIds: string[],
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.videos.findOne({
      id: ingredientIds[0],
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!existing)
      throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
    return serializeSingle(request, VideoSerializer, {
      ...existing,
      pendingIngredientIds: ingredientIds,
    });
  }

  private originalIntent(
    dto: CreateVideoDto,
    request: RequestWithContext,
  ): {
    intent: Record<string, unknown>;
    quoteId?: string;
  } {
    const invalid = () =>
      new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    const record = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value);
    let source: unknown = request.body;
    if (request.body === undefined) {
      if (!record(dto)) throw invalid();
      source = Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      );
    }
    if (!record(source)) throw invalid();
    if ('data' in source) {
      if (
        Object.keys(source).some((key) => key !== 'data') ||
        !record(source.data)
      )
        throw invalid();
      const data = source.data;
      if (
        data.type !== 'video' ||
        !record(data.attributes) ||
        Object.keys(data).some(
          (key) => !['type', 'attributes', 'id'].includes(key),
        ) ||
        (data.id !== undefined && typeof data.id !== 'string')
      )
        throw invalid();
      this.assertLogicalKeys(data.attributes);
      try {
        const decoded = getDeserializer(source as JsonApiDocument);
        if (isDeserializerRuntime(decoded) || !record(decoded)) throw invalid();
        const { id: _transportId, ...attributes } = decoded;
        source = attributes;
      } catch {
        throw invalid();
      }
    }
    if (!record(source)) throw invalid();
    this.assertLogicalKeys(source);
    if (
      source.model !== dto.model ||
      !CRUN_VIDEO_MODEL_KEYS.some((key) => key === source.model)
    )
      throw invalid();
    const quoteId = source.crunQuoteId;
    if (
      quoteId !== undefined &&
      (typeof quoteId !== 'string' || !quoteId.length || quoteId.length > 256)
    )
      throw invalid();
    if (
      source.waitForCompletion !== undefined &&
      source.waitForCompletion !== false
    )
      throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    for (const key of ['brandId', 'brand', 'folderId', 'folder'])
      if (source[key] !== undefined && !isEntityId(source[key]))
        throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    if (
      (source.brandId !== undefined &&
        source.brand !== undefined &&
        source.brandId !== source.brand) ||
      (source.folderId !== undefined &&
        source.folder !== undefined &&
        source.folderId !== source.folder)
    )
      throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    const intent = Object.fromEntries(
      INTENT_FIELDS.filter((key) => source[key] !== undefined).map((key) => [
        key,
        source[key],
      ]),
    );
    if (intent.brandId === undefined && source.brand !== undefined)
      intent.brandId = source.brand;
    if (intent.folderId === undefined && source.folder !== undefined)
      intent.folderId = source.folder;
    return {
      intent,
      quoteId: typeof quoteId === 'string' ? quoteId : undefined,
    };
  }

  private assertLogicalKeys(source: Record<string, unknown>): void {
    const allowed = new Set<string>([
      ...INTENT_FIELDS,
      'brand',
      'folder',
      'crunQuoteId',
      'waitForCompletion',
    ]);
    if (Object.keys(source).some((key) => !allowed.has(key)))
      throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
  }
}
