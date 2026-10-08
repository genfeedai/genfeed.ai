import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { SocialTimelineService } from '@api/services/social-timeline/social-timeline.service';
import { SocialTimelineProviderService } from '@api/services/social-timeline/social-timeline-provider.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [CredentialsCoreModule, WorkflowsCoreModule],
  providers: [
    YoutubeAuthService,
    SocialTimelineProviderService,
    SocialTimelineService,
  ],
  exports: [SocialTimelineService],
})
export class SocialTimelineModule {}
