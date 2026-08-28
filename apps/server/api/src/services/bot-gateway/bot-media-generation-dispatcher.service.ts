import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource, BotCommandType } from '@genfeedai/enums';
import type {
  CreditsConfig,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import { CreateVideoDto } from '@server/collections/videos/dto/create-video.dto';
import type { BotMediaGenerationDispatcher } from '@server/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import type { Request } from 'express';

type BotGenerationRequest = RequestWithContext & {
  creditsConfig: CreditsConfig & { deferred: boolean };
  user: AuthenticatedUser;
};

@Injectable()
export class BotMediaGenerationDispatcherService
  implements BotMediaGenerationDispatcher
{
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
    private readonly videoGenerationService: VideoGenerationService,
    private readonly creditDeductionQueueService: CreditDeductionQueueService,
  ) {}

  async generate(
    input: Parameters<BotMediaGenerationDispatcher['generate']>[0],
  ): Promise<{ ingredientId: string }> {
    const request = this.prepareRequest(input.request, input.user);
    let response: JsonApiSingleResponse;
    switch (input.command) {
      case BotCommandType.PROMPT_IMAGE:
        response = await this.imageGenerationService.generateImage(
          request.user,
          {
            brandId: input.user.brandId,
            brandingMode: 'brand',
            isBrandingEnabled: true,
            outputs: 1,
            text: input.prompt,
            waitForCompletion: false,
          } satisfies CreateImageDto,
          request,
          input.onPlaceholderCreated,
        );
        break;
      case BotCommandType.PROMPT_VIDEO:
        response = await this.videoGenerationService.generateVideo(
          request.user,
          {
            brandId: input.user.brandId,
            brandingMode: 'brand',
            isBrandingEnabled: true,
            outputs: 1,
            text: input.prompt,
            waitForCompletion: false,
          } satisfies CreateVideoDto,
          request,
          input.onPlaceholderCreated,
        );
        break;
      default:
        throw new BadRequestException('Unsupported bot generation command');
    }

    const ingredientId = this.readIngredientId(response);
    await this.settleCredits(request, ingredientId);
    return { ingredientId };
  }

  private prepareRequest(
    request: Request,
    user: Parameters<BotMediaGenerationDispatcher['generate']>[0]['user'],
  ): BotGenerationRequest {
    const identity: AuthenticatedUser = {
      brandId: user.brandId,
      id: user.userId,
      organizationId: user.organizationId,
      userId: user.userId,
    };

    return Object.assign(request, {
      context: {
        brandId: user.brandId,
        hydratedAt: Date.now(),
        isSuperAdmin: false,
        organizationId: user.organizationId,
        stripeSubscriptionStatus: '',
        subscriptionTier: '',
        userId: user.userId,
      },
      creditsConfig: {
        deferred: true,
        description: 'Bot media generation',
        source: ActivitySource.BOT_GENERATION,
      },
      user: identity,
    });
  }

  private readIngredientId(response: JsonApiSingleResponse): string {
    const ingredientId = response.data?.id;
    if (!ingredientId) {
      throw new InternalServerErrorException(
        'Bot generation did not return a durable Ingredient ID',
      );
    }
    return ingredientId;
  }

  private async settleCredits(
    request: BotGenerationRequest,
    ingredientId: string,
  ): Promise<void> {
    const config = request.creditsConfig;
    const amount = config.amount ?? 0;
    if (amount <= 0) {
      return;
    }

    const idempotencyKey = `bot-media-${ingredientId}`;
    const data = {
      amount,
      description: config.description,
      idempotencyKey,
      metadata: config.pricingMetadata
        ? { ...config.pricingMetadata }
        : undefined,
      organizationId: request.user.organizationId,
      referenceId: ingredientId,
      referenceType: 'bot-media:generation',
      source: config.source ?? ActivitySource.BOT_GENERATION,
      userId: request.user.userId,
    };

    if (config.isByokBypass) {
      await this.creditDeductionQueueService.queueByokUsage({
        ...data,
        type: 'record-byok-usage',
      });
      return;
    }

    await this.creditDeductionQueueService.queueDeduction({
      ...data,
      settlementAssetId: ingredientId,
      type: 'deduct-credits',
    });
  }
}
