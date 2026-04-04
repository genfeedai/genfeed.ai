import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { HedraModule } from '@api/services/integrations/hedra/hedra.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { PersonaContentService } from '@api/services/persona-content/persona-content.service';
import { PersonaContentPlanService } from '@api/services/persona-content/persona-content-plan.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    PersonaContentPlanService,
    PersonaContentService,
    PersonaPublisherService,
  ],
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => ElevenLabsModule),
    forwardRef(() => HedraModule),
    forwardRef(() => HeyGenModule),
    forwardRef(() => PersonasModule),
    forwardRef(() => PostsModule),
  ],
  providers: [
    PersonaContentPlanService,
    PersonaContentService,
    PersonaPublisherService,
  ],
})
export class PersonaContentModule {}
