import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  isTopazVideoUpscaleFps,
  isTopazVideoUpscaleResolution,
  topazImageUpscaleFactor,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/** What a workflow upscale node dispatches with and how its output is funded. */
export interface WorkflowUpscaleFunding {
  /** The Topaz model this source is upscaled with. */
  model: string;
  /** Provider input the quote was priced on, so the run matches the charge. */
  providerInput: Record<string, unknown>;
  /** Binds the output to its hold before the provider sees the job. */
  bind(ingredientId: string): Promise<void>;
  /** A definitive rejection: the output hold goes back. */
  reject(ingredientId: string): Promise<void>;
  /** Returns whatever no output claimed. Always runs after dispatch. */
  releasePool(): Promise<void>;
}

export interface WorkflowUpscaleFundingInput {
  brandId: string;
  category: IngredientCategory;
  organizationId: string;
  scale: unknown;
  sourceIngredientId: string;
  targetFps: unknown;
  targetResolution: unknown;
  userId: string;
}

/**
 * Funds a workflow upscale node before it dispatches. The quote reads the
 * stored source ingredient (width, height or duration), never the node or the
 * client, with the same Topaz arguments as the direct upscale endpoints, so a
 * workflow charges what the direct upscale would. A source with no stored size
 * or length is refused before any hold or provider call exists.
 */
@Injectable()
export class WorkflowUpscaleFundingService {
  constructor(
    private readonly generationBilling: GenerationBillingService,
    private readonly modelQuotes: ModelCreditQuoteService,
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async fund(
    input: WorkflowUpscaleFundingInput,
  ): Promise<WorkflowUpscaleFunding> {
    const isVideo = input.category === IngredientCategory.VIDEO;
    const model = isVideo
      ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
      : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE;
    const source = await this.readStoredSource(input);
    const priced = isVideo
      ? this.priceVideo(input, source.duration)
      : this.priceImage(input, source.width, source.height);
    const snapshot = await this.modelQuotes.quoteSnapshotByKey(model, {
      ...priced.quantities,
      organizationId: input.organizationId,
      outputs: 1,
      requests: 1,
    });
    if (!Number.isFinite(snapshot.credits) || !(snapshot.credits > 0))
      throw new BadRequestException(`Pricing is unavailable for ${model}.`);

    const credits = snapshot.credits;
    const request = await this.generationBilling.holdForService({
      brandId: input.brandId,
      credits,
      description: `Workflow ${isVideo ? 'video' : 'image'} upscale - ${model}`,
      organizationId: input.organizationId,
      source: isVideo
        ? ActivitySource.VIDEO_UPSCALE
        : ActivitySource.IMAGE_UPSCALE,
      userId: input.userId,
    });
    return {
      model,
      providerInput: priced.providerInput,
      bind: (ingredientId) =>
        this.generationBilling.bindOutput(request, { credits, ingredientId }),
      reject: (ingredientId) =>
        this.releaseOutput(ingredientId, input.organizationId),
      releasePool: () => this.generationBilling.releasePool(request),
    };
  }

  private priceImage(
    input: WorkflowUpscaleFundingInput,
    width: number,
    height: number,
  ) {
    const scale = topazImageUpscaleFactor(input.scale);
    if (scale === null)
      throw new BadRequestException(
        'The upscale factor is not supported, so this upscale cannot be priced.',
      );
    return {
      providerInput: {
        upscale_factor:
          typeof input.scale === 'string' && input.scale ? input.scale : '4x',
      },
      quantities: { height: height * scale, width: width * scale },
    };
  }

  private priceVideo(input: WorkflowUpscaleFundingInput, duration: number) {
    const targetFps = Number(input.targetFps ?? 30);
    const targetResolution = String(input.targetResolution ?? '1080p');
    if (
      !isTopazVideoUpscaleFps(targetFps) ||
      !isTopazVideoUpscaleResolution(targetResolution)
    )
      throw new BadRequestException(
        'The target resolution or frame rate is not supported, so this upscale cannot be priced.',
      );
    return {
      providerInput: {
        target_fps: targetFps,
        target_resolution: targetResolution,
      },
      quantities: {
        duration,
        selectors: {
          target_fps: targetFps,
          target_resolution: targetResolution,
        },
      },
    };
  }

  /** Measured on the stored ingredient of this organization; nothing is guessed. */
  private async readStoredSource(input: WorkflowUpscaleFundingInput) {
    const ingredient = await this.prisma.ingredient.findFirst({
      select: {
        metadata: { select: { duration: true, height: true, width: true } },
      },
      where: {
        id: input.sourceIngredientId,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
    const width = ingredient?.metadata?.width ?? 0;
    const height = ingredient?.metadata?.height ?? 0;
    const duration = ingredient?.metadata?.duration ?? 0;
    const isVideo = input.category === IngredientCategory.VIDEO;
    if (isVideo ? !(duration > 0) : !(width > 0) || !(height > 0)) {
      this.loggerService.warn(
        'WorkflowUpscaleFundingService refused an upscale with no stored source size',
        {
          category: input.category,
          organizationId: input.organizationId,
          sourceIngredientId: input.sourceIngredientId,
        },
      );
      throw new BadRequestException(
        isVideo
          ? 'The source video length is unknown, so this upscale cannot be priced.'
          : 'The source image size is unknown, so this upscale cannot be priced.',
      );
    }
    return { duration, height, width };
  }

  private async releaseOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        'WorkflowUpscaleFundingService output hold release failed',
        error,
        { ingredientId, organizationId },
      );
    }
  }
}
