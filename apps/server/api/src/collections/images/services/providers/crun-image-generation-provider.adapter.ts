import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { CrunImageQuoteIntent } from '@api/collections/images/dto/create-crun-image-quote.dto';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { CrunImageInputService } from '@api/collections/images/services/crun-image-input.service';
import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { ImagesService } from '@api/collections/images/services/images.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  type CrunGenerationStrategy,
  dispatchFrozenCrunGeneration,
} from '@api/services/integrations/crun/crun-generation-lifecycle';
import { CrunPreviewQuoteService } from '@api/services/integrations/crun/crun-preview-quote.service';
import type { CrunFrozenImageQuote } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivitySource,
  IngredientCategory,
  MetadataExtension,
  PromptCategory,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const INTENT_FIELDS = [
  'model',
  'text',
  'brandId',
  'folderId',
  'promptId',
  'references',
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
export class CrunImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'crun' as const;
  constructor(
    private readonly preview: CrunPreviewQuoteService,
    private readonly input: CrunImageInputService,
    private readonly tasks: CrunTaskService,
    private readonly billing: GenerationBillingService,
    private readonly credits: CreditsUtilsService,
    private readonly shared: SharedService,
    private readonly prompts: PromptsService,
    private readonly images: ImagesService,
    private readonly prisma: PrismaService,
    private readonly receipts: MediaGenerationReceiptsService,
  ) {}

  private readonly strategy: CrunGenerationStrategy<
    CrunImageQuoteIntent,
    CrunFrozenImageQuote
  > = {
    activitySource: ActivitySource.IMAGE_GENERATION,
    category: IngredientCategory.IMAGE,
    defaultDescription: 'Image generation',
    isPreflightCompensated: false,
    promptCategory: PromptCategory.MODELS_PROMPT_IMAGE,
    assertCurrent: (frozen) => this.preview.assertCurrent(frozen),
    extension: (frozen) =>
      frozen.request.input.output_format === 'jpg'
        ? MetadataExtension.JPG
        : MetadataExtension.PNG,
    normalize: (raw, user) => this.input.normalize(raw, user),
    referenceCount: (intent) => intent.references?.length ?? 0,
    resolveOutputPersonaId: (intent, user, brandId) =>
      this.input.resolveOutputPersonaId(intent, user, brandId),
    sourceIds: (intent) => intent.references,
  };

  async generateQuoted(
    user: AuthenticatedUser,
    dto: CreateImageDto,
    request: RequestWithContext,
  ): Promise<JsonApiSingleResponse> {
    const billingRequest = request as RequestWithContext &
      GenerationBillingRequest;
    if (
      (request as DeferredCreditsRequest).approvedRemixQuoteId !== undefined ||
      (dto as CreateImageDto & { approvedRemixQuoteId?: string })
        .approvedRemixQuoteId !== undefined ||
      (request as DeferredCreditsRequest).creditsConfig?.approvedImageQuote !==
        undefined
    )
      throw new BadRequestException({ code: 'CRUN_BILLING_UNSUPPORTED' });
    const raw = this.intentFromDto(dto);
    if (
      request.generationOriginalPrompt !== undefined &&
      request.generationOriginalPrompt !== dto.text.trim()
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
        provenance.enhanced !== dto.text.trim()
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
    let quoteId = dto.crunQuoteId;
    if (!quoteId) {
      const quoted = await this.preview.preview(raw, user);
      if (!quoted.isAvailable)
        throw new BadRequestException({ code: quoted.reasonCode });
      quoteId = quoted.quoteId;
    }
    const consumed = await this.preview.consume(raw, quoteId, user);
    if (consumed.kind === 'replay') {
      const existing = await this.images.findOne({
        id: consumed.ingredientIds[0],
        organizationId: user.organizationId,
        isDeleted: false,
      });
      if (!existing)
        throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
      return serializeSingle(request, IngredientSerializer, {
        ...existing,
        pendingIngredientIds: consumed.ingredientIds,
      });
    }
    const frozen = consumed.quote;
    const ingredients = await dispatchFrozenCrunGeneration(
      {
        billing: this.billing,
        credits: this.credits,
        prisma: this.prisma,
        prompts: this.prompts,
        receipts: this.receipts,
        shared: this.shared,
        tasks: this.tasks,
      },
      this.strategy,
      { billingRequest, frozen, raw, user },
    );
    const first = await this.images.findOne({
      id: ingredients[0].ingredientData.id,
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!first) throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
    return serializeSingle(request, IngredientSerializer, {
      ...first,
      pendingIngredientIds: ingredients.map((docs) => docs.ingredientData.id),
    });
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    const task = await this.tasks.findForIngredient(
      request.organizationId,
      request.ingredientId ?? '',
    );
    if (!task || !request.crunProviderRequest)
      throw new BadRequestException({ code: 'CRUN_TASK_BINDING_INVALID' });
    const providerRequest = request.crunProviderRequest;
    return {
      tracksSubmissionStarted: true,
      additionalActivityFailure: 'ignore',
      additionalFailureLabel: 'Crun image task',
      additionalPlaceholderFailureLabel: 'Crun',
      completionKind: 'background-only',
      failureLabel: 'Crun image task',
      outputStrategy: 'sequential',
      trackAdditionalOutputsInResponse: true,
      generate: async () => {
        const result = await this.tasks.submit(task, providerRequest);
        if (
          !result.isSubmitted ||
          !('taskId' in result) ||
          typeof result.taskId !== 'string'
        )
          throw new ConflictException({ code: result.reasonCode });
        return { kind: 'external-id', externalId: result.taskId };
      },
    };
  }

  private intentFromDto(dto: CreateImageDto): Record<string, unknown> {
    const source = dto as unknown as Record<string, unknown>;
    const allowed = new Set<string>([
      ...INTENT_FIELDS,
      'brand',
      'folder',
      'crunQuoteId',
      'waitForCompletion',
      'scope',
      'isDefault',
    ]);
    if (
      Object.keys(source).some(
        (key) => source[key] !== undefined && !allowed.has(key),
      )
    )
      throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    if (
      (source.brandId && source.brand && source.brandId !== source.brand) ||
      (source.folderId && source.folder && source.folderId !== source.folder)
    )
      throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    const intent = Object.fromEntries(
      INTENT_FIELDS.filter((key) => source[key] !== undefined).map((key) => [
        key,
        source[key],
      ]),
    );
    if (!intent.brandId && source.brand) intent.brandId = source.brand;
    if (!intent.folderId && source.folder) intent.folderId = source.folder;
    return intent;
  }
}
