import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { RequestContextModule } from '@api/common/request-context.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { AgentEndpointInvoker } from '@api/services/agent-generation-gateway/agent-endpoint-invoker.service';
import { AgentGenerationGatewayService } from '@api/services/agent-generation-gateway/agent-generation-gateway.service';
import { ByokModule } from '@api/services/byok/byok.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { AGENT_GENERATION_GATEWAY } from '@server/services/agent-orchestrator/gateway/agent-generation-gateway.interface';

/**
 * Wires the in-process generation gateway.
 *
 * The guards and the credits interceptor are provided here rather than imported
 * because Nest enhancers are per-module providers; these are the same classes
 * the HTTP controllers use, instantiated for in-process invocation.
 *
 * `AgentEndpointInvoker` is exported on purpose: every future in-process
 * gateway (non-generation endpoints included) reuses the one enforcement
 * sequence instead of restating it.
 */
@Module({
  exports: [
    AGENT_GENERATION_GATEWAY,
    AgentEndpointInvoker,
    AgentGenerationGatewayService,
  ],
  imports: [
    ByokModule,
    ConfigModule,
    CreditsModule,
    ImagesModule,
    MembersModule,
    ModelsModule,
    MusicsModule,
    RequestContextModule,
    VideoGenerationModule,
    VideosCoreModule,
    VideosModule,
    VoicesModule,
  ],
  providers: [
    AgentEndpointInvoker,
    AgentGenerationGatewayService,
    CreditsGuard,
    CreditsInterceptor,
    ModelsGuard,
    RolesGuard,
    SubscriptionGuard,
    {
      provide: AGENT_GENERATION_GATEWAY,
      useExisting: AgentGenerationGatewayService,
    },
  ],
})
export class AgentGenerationGatewayModule {}
