import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoGenerationCompletionService } from '@api/collections/videos/services/video-generation-completion.service';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { VideoGenerationPreparationService } from '@api/collections/videos/services/video-generation-preparation.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

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
  ) {}

  async generateVideo(
    user: User,
    createVideoDto: CreateVideoDto,
    request: Request,
  ): Promise<JsonApiSingleResponse> {
    const resolved = await this.preparationService.resolve(
      user,
      createVideoDto,
      request,
    );
    await this.creditsService.ensureDeferredCredits(
      createVideoDto,
      resolved.model,
      resolved.publicMetadata.organization,
      request,
    );
    const context = await this.preparationService.prepare(resolved);
    await this.executionService.execute(context);
    return this.completionService.complete(context);
  }
}
