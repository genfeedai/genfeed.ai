import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoGenerationCompletionService } from '@api/collections/videos/services/video-generation-completion.service';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { VideoGenerationPreparationService } from '@api/collections/videos/services/video-generation-preparation.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import { Injectable } from '@nestjs/common';

const VIDEO_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.userMinimal,
  PopulatePatterns.brandMinimal,
];
const PROVIDER_DISPATCH_GRACE_MS = 5 * 60 * 1000;

/**
 * Coordinates the stable video-generation stages. Validation/model resolution,
 * deferred credits, persistence/provider execution, and completion each remain
 * independently testable behind a bounded service.
 */
@Injectable()
export class VideoGenerationService {
  constructor(
    private readonly completionService: VideoGenerationCompletionService,
    private readonly creditsService: VideoGenerationCreditsService,
    private readonly executionService: VideoGenerationExecutionService,
    private readonly preparationService: VideoGenerationPreparationService,
    private readonly videosService: VideosService,
  ) {}

  async generateVideo(
    user: User,
    createVideoDto: CreateVideoDto,
    request: Request,
    onPlaceholderCreated?: GenerationPlaceholderCreatedCallback,
    placeholderScope?: GenerationPlaceholderScope,
    onCreditsPrepared?: () => Promise<void>,
    runReferences?: readonly GenerationBriefReference[],
  ): Promise<JsonApiSingleResponse> {
    const resolved = await this.preparationService.resolve(
      user,
      createVideoDto,
      request,
    );
    if (createVideoDto.sourceActionId) {
      const accepted = await this.videosService.findOne(
        {
          category: IngredientCategory.VIDEO,
          isDeleted: false,
          organizationId: user.organizationId,
          sourceActionId: createVideoDto.sourceActionId,
          status: {
            in: [
              IngredientStatus.PROCESSING,
              IngredientStatus.GENERATED,
              IngredientStatus.VALIDATED,
            ],
          },
        },
        VIDEO_POPULATE,
      );
      if (accepted) {
        const isFreshUndispatchedPlaceholder =
          accepted.status === IngredientStatus.PROCESSING &&
          !accepted.metadata?.externalId &&
          accepted.createdAt instanceof Date &&
          Date.now() - accepted.createdAt.getTime() <
            PROVIDER_DISPATCH_GRACE_MS;
        const wasDispatched =
          accepted.status !== IngredientStatus.PROCESSING ||
          Boolean(accepted.metadata?.externalId) ||
          isFreshUndispatchedPlaceholder;
        if (wasDispatched) {
          await this.creditsService.ensureDeferredCredits(
            createVideoDto,
            resolved.model,
            resolved.user.organizationId,
            request,
          );
          await onCreditsPrepared?.();
          return serializeSingle(request, VideoSerializer, accepted);
        }
        await this.videosService.patch(accepted.id, {
          status: IngredientStatus.FAILED,
        });
      }
    }
    const context = await this.preparationService.prepare(
      resolved,
      placeholderScope,
      runReferences,
    );
    try {
      await onPlaceholderCreated?.(context.ingredientData.id.toString());
      await this.creditsService.ensureDeferredCredits(
        createVideoDto,
        resolved.model,
        resolved.user.organizationId,
        request,
      );
      await onCreditsPrepared?.();
    } catch (error: unknown) {
      return this.executionService.failPlaceholderBeforeDispatch(
        context,
        error,
      );
    }
    await this.executionService.execute(context);
    return this.completionService.complete(context);
  }
}
