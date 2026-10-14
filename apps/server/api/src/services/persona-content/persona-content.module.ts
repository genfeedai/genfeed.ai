import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { OrganizationModuleAccessModule } from '@api/common/organization-modules/organization-module-access.module';
import { AutonomousPublishingModule } from '@api/services/autonomous-publishing/autonomous-publishing.module';
import { PersonaContentPlanService } from '@api/services/persona-content/persona-content-plan.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { TurboRunModule } from '@api/services/turbo-run/turbo-run.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [PersonaContentPlanService, PersonaPublisherService],
  imports: [
    AutonomousPublishingModule,
    TurboRunModule,
    CredentialsCoreModule,
    OrganizationModuleAccessModule,
    PersonasCoreModule,
    PostsModule,
  ],
  providers: [PersonaContentPlanService, PersonaPublisherService],
})
export class PersonaContentModule {}
