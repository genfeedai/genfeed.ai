import { buildImageQuoteProviderInput } from '@api/collections/images/services/image-generation-prompt-settings.util';
import {
  isNativeImageBatch,
  resolveImageBillableOutputs,
  resolveImageGenerationProvider,
} from '@api/collections/images/services/image-generation-provider.util';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { getFalEndpointFromModelKey } from '@api/collections/models/utils/model-key.util';
import { prepareFalVideoDispatch } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import { buildVideoQuoteSelectors } from '@api/helpers/utils/credits/video-quote-selectors.util';
import {
  hasProviderVideoDurationRule,
  normalizeProviderVideoDuration,
} from '@api/services/prompt-builder/builders/replicate/provider-video-duration.util';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  IMAGE_EDIT_QUALITY,
  isFlux3ImageModel,
  isFlux3Resolution,
  MODEL_OUTPUT_CAPABILITIES,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import {
  type AgentGenerationQuote,
  type AgentGenerationQuoteInput,
  AgentGenerationQuoteUnavailableReason,
  type ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';
import type { Model } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';

import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export type PreparedAgentGenerationQuote = AgentGenerationQuote & {
  snapshot?: ModelBillableQuoteSnapshot;
};

type VideoEstimateModel = Pick<Model, 'provider'> &
  Partial<
    Pick<Model, 'endpoint' | 'providerInputSchema' | 'providerSchemaFamily'>
  >;

function unavailableQuote(
  unavailableReason: AgentGenerationQuoteUnavailableReason,
  modelKey: string | null = null,
): AgentGenerationQuote {
  return { credits: null, isAvailable: false, modelKey, unavailableReason };
}

function isPricingUnresolved(error: unknown): boolean {
  if (!(error instanceof ServiceUnavailableException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'PRICING_UNAVAILABLE'
  );
}

/**
 * #4672 Manual-mode review card estimate, #4813 billing parity. Resolves the
 * concrete, organization-enabled model the Agent's request would actually use
 * (the same `RouterService.selectModel` auto-selection the real generation
 * call makes) and prices it through the very calculator
 * `ImageGenerationCreditsService` / `VideoGenerationCreditsService` reserve
 * with: actual execution dimensions, exact reviewed selectors, request/output
 * quantities and the same frozen tariff admission uses.
 *
 * Invalid output counts reject. An unresolvable model, missing pricing, or
 * any registry error surfaces as `isAvailable: false` so the review card
 * renders as unavailable and prevents generation until a current quote exists.
 * Quoting never debits credits and never contacts a generation provider.
 */
@Injectable()
export class AgentGenerationEstimateService {
  constructor(
    private readonly routerService: RouterService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly logger: LoggerService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
    private readonly promptBuilderService: PromptBuilderService,
  ) {}

  async estimate(
    input: AgentGenerationQuoteInput,
  ): Promise<AgentGenerationQuote> {
    const { snapshot: _snapshot, ...quote } =
      await this.estimateWithSnapshot(input);
    return quote;
  }

  /** Server-only consent preparation; the public estimate omits tariff evidence. */
  async estimateWithSnapshot(
    input: AgentGenerationQuoteInput,
  ): Promise<PreparedAgentGenerationQuote> {
    if (
      input.outputs !== undefined &&
      (!Number.isInteger(input.outputs) ||
        input.outputs < 1 ||
        input.outputs > 8)
    ) {
      throw new BadRequestException(
        'Outputs must be an integer between 1 and 8.',
      );
    }
    const isEdit = input.category === 'image-edit';
    const category = this.resolveCategory(input);
    // Only routing by prompt needs one; an edit default resolves without it.
    if (!input.modelKey && !isEdit && !input.prompt?.trim()) {
      return unavailableQuote(
        AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
      );
    }
    try {
      const modelKey = await this.resolveModelKey(input, category);
      const model = await this.loadAvailableModel(modelKey, category, input);
      if (!model) {
        return unavailableQuote(
          AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
          modelKey.startsWith('crun/') ? modelKey : null,
        );
      }
      return await this.quoteModel(input, modelKey, model);
    } catch (error: unknown) {
      return this.unavailableFromError(error, input);
    }
  }

  private resolveCategory(input: AgentGenerationQuoteInput): ModelCategory {
    if (input.category === 'video') return ModelCategory.VIDEO;
    return input.category === 'image-edit'
      ? ModelCategory.IMAGE_EDIT
      : ModelCategory.IMAGE;
  }

  private async resolveModelKey(
    input: AgentGenerationQuoteInput,
    category: ModelCategory,
  ): Promise<string> {
    if (input.modelKey) return input.modelKey;
    if (input.category === 'image-edit') {
      return (
        await this.routerService.resolveModelKey({
          category,
          organizationId: input.organizationId,
        })
      ).key;
    }
    return (
      await this.routerService.selectModel({
        category,
        duration: input.duration,
        organizationId: input.organizationId,
        outputs: input.outputs,
        prioritize: input.prioritize,
        prompt: input.prompt ?? '',
      })
    ).modelDetails.key;
  }

  /** The organization's active model for this category, or null when it cannot be quoted. */
  private async loadAvailableModel(
    modelKey: string,
    category: ModelCategory,
    input: AgentGenerationQuoteInput,
  ) {
    if (modelKey.startsWith('crun/')) return null;
    let model: Awaited<
      ReturnType<ModelRegistrationService['validateModelForOrg']>
    >;
    try {
      model = await this.modelRegistrationService.validateModelForOrg(
        modelKey,
        input.organizationId,
      );
    } catch (error: unknown) {
      // The registry rejects an unknown, foreign or not-enabled model by throwing.
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      )
        return null;
      throw error;
    }
    const isUsable =
      model &&
      model.key === modelKey &&
      model.category === category &&
      model.isActive &&
      !model.isDeleted &&
      (!model.organizationId || model.organizationId === input.organizationId);
    return isUsable ? model : null;
  }

  private async quoteModel(
    input: AgentGenerationQuoteInput,
    modelKey: string,
    model: VideoEstimateModel,
  ): Promise<PreparedAgentGenerationQuote> {
    const isVideo = input.category === 'video';
    const dimensions =
      input.dimensions ??
      (input.width !== undefined && input.height !== undefined
        ? { height: input.height, width: input.width }
        : undefined) ??
      resolveAgentGenerationDimensions(
        input.aspectRatio,
        isVideo
          ? DEFAULT_AGENT_VIDEO_ASPECT_RATIO
          : DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
      );
    const provider = isVideo
      ? model.provider
      : resolveImageGenerationProvider(modelKey, model.provider);
    if (!provider)
      return unavailableQuote(
        AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
      );
    const outputs = isVideo
      ? (input.outputs ?? 1)
      : resolveImageBillableOutputs(provider, input.outputs ?? 1);
    const isBatchSupported = isVideo
      ? Boolean(MODEL_OUTPUT_CAPABILITIES[modelKey]?.isBatchSupported)
      : isNativeImageBatch(modelKey, provider);
    const flux = isFlux3ImageModel(modelKey);
    if (
      flux &&
      (outputs !== 1 ||
        !isFlux3Resolution(input.resolution ?? '1k') ||
        input.quality !== undefined)
    )
      return unavailableQuote(
        AgentGenerationQuoteUnavailableReason.MISSING_SETTING,
      );
    const quote = await this.modelCreditQuote.quoteSnapshotByKey(modelKey, {
      ...dimensions,
      organizationId: input.organizationId,
      provider,
      outputs,
      requests: isBatchSupported ? 1 : outputs,
      ...(await this.buildPricedFields(
        input,
        modelKey,
        dimensions,
        outputs,
        model,
        provider,
      )),
    });
    const credits = quote.credits;
    return Number.isFinite(credits) && credits >= 0
      ? { credits, isAvailable: true, modelKey, snapshot: quote }
      : unavailableQuote(
          AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
        );
  }

  /** Duration, provider input and selectors, shaped exactly as admission supplies them. */
  private async buildPricedFields(
    input: AgentGenerationQuoteInput,
    modelKey: string,
    dimensions: { height: number; width: number },
    outputs: number,
    model: VideoEstimateModel,
    provider: string,
  ) {
    if (input.category === 'video') {
      const duration = input.duration ?? DEFAULT_AGENT_VIDEO_DURATION_SECONDS;
      let providerInput = await this.buildVideoProviderInput(modelKey, {
        ...dimensions,
        duration,
        isAudioEnabled: input.isAudioEnabled,
        modelInputSchema: isRecord(model.providerInputSchema)
          ? model.providerInputSchema
          : undefined,
        outputs,
        references: input.referenceUrls,
        resolution: input.resolution,
      });
      const endpoint = getFalEndpointFromModelKey(model.endpoint ?? modelKey);
      if (
        provider === 'fal' &&
        /^(?:bytedance\/seedance-|fal-ai\/bytedance\/seedance\/)/.test(
          endpoint,
        ) &&
        model.providerSchemaFamily &&
        isRecord(model.providerInputSchema)
      ) {
        try {
          providerInput = prepareFalVideoDispatch({
            ...dimensions,
            duration,
            imageUrl: input.referenceUrls?.[0],
            model: modelKey,
            modelEndpoint: endpoint,
            modelInputSchema: model.providerInputSchema,
            modelProvider: provider,
            modelSchemaFamily: model.providerSchemaFamily,
            prompt: input.prompt ?? 'Price estimate',
            promptParams: providerInput ?? {},
          }).input;
        } catch {
          throw new ServiceUnavailableException({
            code: 'PRICING_UNAVAILABLE',
            message: 'Provider input cannot be priced for the selected schema',
          });
        }
      }
      return {
        duration,
        // The same provider input admission quotes, so a provider that
        // normalizes duration (Hailuo 5 s -> 6 s) is priced as executed.
        providerInput,
        selectors: buildVideoQuoteSelectors({
          isAudioEnabled: input.isAudioEnabled,
          resolution: input.resolution,
        }),
      };
    }
    const flux = isFlux3ImageModel(modelKey);
    // Admission always edits at the fixed quality tier; only Flux has a resolution.
    const selected = flux
      ? (input.resolution ?? '1k')
      : input.category === 'image-edit'
        ? IMAGE_EDIT_QUALITY
        : input.quality;
    return {
      providerInput:
        provider === 'replicate'
          ? await buildImageQuoteProviderInput(
              this.promptBuilderService,
              modelKey,
              {
                ...dimensions,
                aspectRatio: input.aspectRatio,
                outputs,
                quality: input.quality,
                resolution: input.resolution,
              },
              model.providerInputSchema,
              input.referenceUrls,
              input.category === 'image-edit'
                ? (input.editSize ?? 'source')
                : undefined,
            )
          : undefined,
      ...(selected !== undefined
        ? { selectors: { [flux ? 'resolution' : 'quality']: selected } }
        : {}),
    };
  }

  private unavailableFromError(
    error: unknown,
    input: AgentGenerationQuoteInput,
  ): AgentGenerationQuote {
    if (isPricingUnresolved(error)) {
      this.logger.warn('Generation credit estimate has no exact tariff', {
        category: input.category,
        error: error instanceof Error ? error.message : String(error),
        organizationId: input.organizationId,
      });
      return unavailableQuote(
        AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
      );
    }
    this.logger.error('Generation credit estimate failed', error, {
      category: input.category,
      organizationId: input.organizationId,
    });
    return unavailableQuote(AgentGenerationQuoteUnavailableReason.ERROR);
  }

  /** The provider-built input admission quotes; absent when no builder serves the model. */
  private async buildVideoProviderInput(
    modelKey: string,
    params: {
      duration: number;
      height: number;
      isAudioEnabled?: boolean;
      modelInputSchema?: Record<string, unknown>;
      outputs: number;
      references?: string[];
      resolution?: string;
      width: number;
    },
  ): Promise<Record<string, unknown> | undefined> {
    // A fixed-length provider is priced at the length it executes, without
    // needing the references the full builder would validate.
    if (hasProviderVideoDurationRule(modelKey))
      return {
        duration: normalizeProviderVideoDuration(modelKey, params.duration),
      };
    try {
      const built = await this.promptBuilderService.buildPrompt(modelKey, {
        ...params,
        brandingMode: 'off',
        modelCategory: ModelCategory.VIDEO,
        prompt: 'Price estimate',
        useTemplate: false,
      });
      return built.input as unknown as Record<string, unknown>;
    } catch (error: unknown) {
      this.logger.warn(
        'Video estimate used the request without provider input',
        {
          error: error instanceof Error ? error.message : String(error),
          modelKey,
        },
      );
      return undefined;
    }
  }
}
