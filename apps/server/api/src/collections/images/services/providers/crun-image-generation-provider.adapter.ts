import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
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
import { reserveGenerationRequestCredits } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { CrunPreviewQuoteService } from '@api/services/integrations/crun/crun-preview-quote.service';
import type {
  CrunFundingBinding,
  CrunPreparedTask,
} from '@api/services/integrations/crun/crun-task.schema';
import { crunFundingBindingSchema } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivitySource,
  IngredientCategory,
  MetadataExtension,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
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
  ) {}

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
          brandId: dto.brandId ?? dto.brand ?? user.brandId,
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
    const raw = this.intentFromDto(dto);
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
    await this.preview.assertCurrent(frozen);
    const provider = frozen.snapshot.providerQuote;
    if (!provider) throw new ConflictException({ code: 'CRUN_QUOTE_STALE' });
    const intent = this.input.normalize(raw, user);
    if (
      provider.credentialSource === 'hosted' &&
      frozen.snapshot.credits > 0 &&
      !(await this.credits.checkOrganizationCreditsAvailable(
        user.organizationId,
        frozen.snapshot.credits,
      ))
    ) {
      const balance = await this.credits.getOrganizationCreditsBalance(
        user.organizationId,
      );
      throw createInsufficientCreditsException(
        frozen.snapshot.credits,
        balance,
      );
    }
    billingRequest.creditsConfig = {
      ...billingRequest.creditsConfig,
      amount: frozen.snapshot.credits,
      deferred: false,
      modelKey: intent.model,
      modelQuote: frozen.snapshot,
      settlement: 'completion',
      source: ActivitySource.IMAGE_GENERATION,
      description:
        billingRequest.creditsConfig?.description ?? 'Image generation',
      isByokBypass: provider.credentialSource === 'byok',
    };
    await reserveGenerationRequestCredits({
      amount: frozen.snapshot.credits,
      creditsUtilsService: this.credits,
      organizationId: user.organizationId,
      request: billingRequest,
    });
    const prompt = intent.promptId
      ? { id: intent.promptId }
      : await this.prompts.create({
          original: intent.text,
          enhanced: intent.text,
          category: PromptCategory.MODELS_PROMPT_IMAGE,
          status: PromptStatus.GENERATED,
          userId: user.userId,
          organizationId: user.organizationId,
          brandId: frozen.brandId,
        });
    const rows: CrunPreparedTask[] = [];
    const ingredients: Awaited<
      ReturnType<SharedService['createMediaDocuments']>
    >[] = [];
    for (
      let outputIndex = 0;
      outputIndex < (intent.outputs ?? 1);
      outputIndex++
    ) {
      const docs = await this.shared.createMediaDocuments(user, {
        category: IngredientCategory.IMAGE,
        brandId: frozen.brandId,
        organizationId: user.organizationId,
        promptId: prompt.id,
        extension:
          frozen.request.input.output_format === 'jpg'
            ? MetadataExtension.JPG
            : MetadataExtension.PNG,
        model: intent.model,
        generationPrompt: String(frozen.request.input.prompt),
        generationSource: 'studio',
        sourceIds: intent.references,
        promptTemplate: frozen.templateUsed,
        templateVersion: frozen.templateVersion,
        groupId: frozen.quoteId,
        groupIndex: outputIndex,
        style: intent.style,
      });
      ingredients.push(docs);
      if (intent.folderId)
        await this.prisma.ingredient.updateMany({
          where: {
            id: docs.ingredientData.id,
            organizationId: user.organizationId,
            isDeleted: false,
          },
          data: { folderId: intent.folderId },
        });
      await this.billing.bindOutput(billingRequest, {
        ingredientId: docs.ingredientData.id,
        credits:
          provider.credentialSource === 'byok'
            ? frozen.snapshot.credits / (intent.outputs ?? 1)
            : frozen.snapshot.allocatedCredits[outputIndex],
        submissionIntentProvider: 'crun',
      });
      let fundingBinding: CrunFundingBinding;
      if (provider.credentialSource === 'byok') {
        const linked = await this.prisma.ingredient.findFirst({
          where: {
            id: docs.ingredientData.id,
            organizationId: user.organizationId,
            isDeleted: false,
          },
          select: { generationBilling: true },
        });
        const receipt = generationUsageReceiptSchema.parse(
          linked?.generationBilling,
        );
        const {
          kind: _kind,
          state: _state,
          confirmedFailure: _failure,
          ...immutable
        } = receipt;
        fundingBinding = crunFundingBindingSchema.parse({
          kind: 'byok',
          receipt: immutable,
        });
      } else
        fundingBinding =
          frozen.snapshot.credits > 0
            ? { kind: 'reservation' }
            : { kind: 'free' };
      rows.push({
        organizationId: user.organizationId,
        userId: user.userId,
        ingredientId: docs.ingredientData.id,
        brandId: frozen.brandId,
        reservationId:
          provider.credentialSource === 'hosted' && frozen.snapshot.credits > 0
            ? (billingRequest.creditsConfig?.reservationId ?? null)
            : null,
        fundingBinding,
        modelKey: intent.model,
        endpoint: frozen.request.model,
        contractVersion: provider.contractVersion,
        quoteId: frozen.quoteId,
        outputIndex,
        inputHash: provider.inputHash,
        inputMetadata: {
          referenceCount: intent.references?.length ?? 0,
          intentHash: frozen.intentHash,
        },
        quoteSnapshot: toPrismaJson(frozen.snapshot) as Prisma.InputJsonObject,
        credentialSource: provider.credentialSource,
        credentialId: provider.credentialId,
        credentialFingerprint: provider.credentialFingerprint,
      });
    }
    const prepared = await this.tasks.prepareTasks(rows);
    // Every durable row and binding precedes the first paid request. Never regenerate effective input here.
    for (const task of prepared) {
      const result = await this.tasks.submit(task, frozen.request);
      if (result.isSubmitted) continue;
      const persisted = await this.tasks.findForIngredient(
        user.organizationId,
        task.ingredientId,
      );
      if (
        persisted?.state === 'provider-failed' &&
        persisted.providerTaskId === null
      )
        await this.billing.recordSubmissionRejection(
          task.ingredientId,
          user.organizationId,
        );
      // Ambiguous acceptance remains funded. No outcome is automatically redispatched.
    }
    await this.billing.releasePool(billingRequest);
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
