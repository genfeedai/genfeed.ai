import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HedraModule } from '@api/services/integrations/hedra/hedra.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { PersonaContentService } from '@api/services/persona-content/persona-content.service';
import { PersonaContentPlanService } from '@api/services/persona-content/persona-content-plan.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    PersonaContentPlanService,
    PersonaContentService,
    PersonaPublisherService,
  ],
  imports: [
    CredentialsCoreModule,
    ElevenLabsModule,
    HedraModule,
    HeyGenModule,
    PersonasCoreModule,
    PostsModule,
  ],
  providers: [
    PersonaContentPlanService,
    PersonaContentService,
    PersonaPublisherService,
  ],
})
export class PersonaContentModule {}
