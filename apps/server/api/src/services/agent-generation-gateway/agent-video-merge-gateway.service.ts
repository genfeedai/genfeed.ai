import { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AgentEndpointInvoker } from '@api/services/agent-generation-gateway/agent-endpoint-invoker.service';
import type {
  AgentGenerationInput,
  IAgentVideoMergeGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { Injectable } from '@nestjs/common';

/**
 * In-process entrypoint to `POST /v1/videos/merge`.
 *
 * Kept apart from the generation gateway because a merge is not a billable
 * generation: it runs on the local files queue with no provider call, exactly
 * like the uncredited REST route it mirrors. The descriptor therefore carries
 * no credits config and no subscription gate, matching the controller, which
 * declares only the class-level `RolesGuard`.
 */
@Injectable()
export class AgentVideoMergeGatewayService implements IAgentVideoMergeGateway {
  constructor(
    private readonly invoker: AgentEndpointInvoker,
    private readonly videoMergeOrchestrationService: VideoMergeOrchestrationService,
  ) {}

  /** Mirrors `VideosMergeController.mergeVideos` — `POST /v1/videos/merge`. */
  async mergeVideos(
    input: AgentGenerationInput,
  ): Promise<JsonApiSingleResponse> {
    return this.invoker.invoke<CreateMergedVideoDto, JsonApiSingleResponse>(
      {
        dto: CreateMergedVideoDto,
        handle: async ({ dto, request, user }) => {
          const ingredient =
            await this.videoMergeOrchestrationService.mergeVideos(user, dto);

          return serializeSingle(request, IngredientSerializer, ingredient);
        },
        organizationModule: { moduleId: 'playground' },
        hasCreditsInterceptor: false,
        hasRolesGuard: true,
        isSubscriptionCheckSkipped: true,
        originalUrl: '/v1/videos/merge',
      },
      input,
    );
  }
}
